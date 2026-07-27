import logging
from io import BytesIO
from datetime import date, datetime, timedelta
from typing import Iterable, Optional


from PIL import Image
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models import Meal, WaterLog
from app.services.gemini_service import GeminiService, MealAnalysisResult
from app.services.food_cache_service import get_cached_or_fetch_macros
from app.utils.dates import day_bounds, parse_date_str, timestamp_within_date

logger = logging.getLogger(__name__)

class MealService:
    """Camada de aplicação: orquestra a análise de IA e a persistência.

    As rotas (camada HTTP) não sabem nada sobre Gemini nem sobre SQLAlchemy
    diretamente — apenas chamam este serviço.
    """

    def __init__(self, gemini_service: GeminiService):
        self._gemini_service = gemini_service

    @staticmethod
    def _items_to_dicts(result: MealAnalysisResult) -> list:
        items = []
        for item in result.items:
            # Garante consistência: se esse alimento já foi visto antes (por
            # qualquer usuário), usa os macros salvos em vez do que a IA acabou
            # de calcular de novo nesta análise. Não evita a chamada ao Gemini
            # (já foi feita) — só evita variação nos macros de alimentos repetidos.
            fresh_macros = {
                "calories": item.calories,
                "protein_g": item.protein_g,
                "carbs_g": item.carbs_g,
                "fat_g": item.fat_g,
            }
            macros = get_cached_or_fetch_macros(item.description, fresh_macros)

            items.append({
                "description": item.description,
                **macros,
                "estimated_grams": item.estimated_grams,
            })
        return items

    # 1. APENAS ANALISA A IMAGEM (Não salva mais no banco)
    def analyze_image(self, image_bytes: bytes) -> dict:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._gemini_service.analyze_image(image)

        # Retorna o rascunho com os itens identificados pela IA (por 100g cada)
        return {
            "items": self._items_to_dicts(result),
            "confidence": result.confidence,
            "source_type": "image"
        }

    # 2. APENAS ANALISA O TEXTO (Não salva mais no banco)
    def analyze_text(self, description: str) -> dict:
        result = self._gemini_service.analyze_text(description)

        return {
            "items": self._items_to_dicts(result),
            "confidence": result.confidence,
            "source_type": "text"
        }

    @staticmethod
    def _aggregate_from_items(items: list) -> dict:
        """Soma os itens confirmados (já escalados pra quantidade real) num total da refeição."""
        return {
            "description": ", ".join(str(item.get("description", "Item")) for item in items),
            "calories": sum(float(item.get("calories", 0)) for item in items),
            "protein_g": sum(float(item.get("protein_g", 0)) for item in items),
            "carbs_g": sum(float(item.get("carbs_g", 0)) for item in items),
            "fat_g": sum(float(item.get("fat_g", 0)) for item in items),
            "quantity_g": sum(float(item.get("quantity_g", 0)) for item in items),
        }

    # 3. NOVO MÉTODO: SALVA A REFEIÇÃO (Recebe os dados confirmados do celular)
    def save_meal(self, meal_data: dict, date_str: Optional[str], user_id: int) -> Meal:
        target_date = parse_date_str(date_str)
        creation_timestamp = timestamp_within_date(target_date)

        items = meal_data.get("items")

        # Refeições com detalhamento por item (foto/texto analisados pela IA): os totais
        # da refeição são derivados da soma dos itens. Sem items (entrada manual, favoritos),
        # mantém o comportamento antigo de campos soltos.
        if items:
            aggregate = self._aggregate_from_items(items)
        else:
            aggregate = {
                "description": meal_data.get("description", "Refeição"),
                "calories": meal_data.get("calories", 0),
                "protein_g": meal_data.get("protein_g", 0),
                "carbs_g": meal_data.get("carbs_g", 0),
                "fat_g": meal_data.get("fat_g", 0),
                "quantity_g": meal_data.get("quantity_g", 100),
            }

        meal = Meal(
            description=aggregate["description"],
            calories=aggregate["calories"],
            protein_g=aggregate["protein_g"],
            carbs_g=aggregate["carbs_g"],
            fat_g=aggregate["fat_g"],
            quantity_g=aggregate["quantity_g"],
            items=items,
            confidence=meal_data.get("confidence"),
            source_type=meal_data.get("source_type", "manual"),
            created_at=creation_timestamp,
            user_id=user_id
        )
        db.session.add(meal)
        db.session.commit()
        return meal

    def get_meals_for_date(self, target_date: date, user_id: int) -> Iterable[Meal]:
        """Busca todas as refeições de um usuário para uma data específica."""
        return Meal.query_by_date(target_date).filter_by(user_id=user_id).all()

    def get_summary_for_date(self, target_date: date, user_id: int) -> dict:
        """Calcula o resumo nutricional de um usuário para uma data específica."""
        meals = list(self.get_meals_for_date(target_date, user_id))

        # Calcula o total de água para a data alvo
        day_start, day_end = day_bounds(target_date)
        total_water = db.session.query(
            func.sum(WaterLog.amount_ml)
        ).filter(
            WaterLog.user_id == user_id,
            WaterLog.created_at.between(day_start, day_end)
        ).scalar() or 0

        return {
            "total_calories": sum(m.calories for m in meals),
            "total_protein_g": sum(m.protein_g for m in meals),
            "total_carbs_g": sum(m.carbs_g for m in meals),
            "total_fat_g": sum(m.fat_g for m in meals),
            "meals_count": len(meals),
            "total_water_ml": total_water,
            "meals": [m.to_dict() for m in meals],
        }

    def delete_meal_by_id(self, meal_id: int, user_id: int) -> bool:
        """
        Apaga uma refeição específica, garantindo que ela pertença ao usuário.

        Args:
            meal_id: O ID da refeição a ser apagada.
            user_id: O ID do usuário que está fazendo a requisição.

        Returns:
            True se a refeição foi apagada com sucesso, False caso contrário.
        """
        try:
            # Busca a refeição pelo ID e pelo ID do usuário em uma única query.
            # Isso garante que um usuário não possa apagar a refeição de outro.
            meal_to_delete = Meal.query.filter_by(id=meal_id, user_id=user_id).first()

            if not meal_to_delete:
                # Se não encontrou, a refeição não existe ou não pertence ao usuário.
                # Por segurança, não diferenciamos os casos na resposta.
                logger.warning(
                    "Tentativa de exclusão falhou: Refeição ID %s não encontrada para o usuário ID %s.",
                    meal_id,
                    user_id
                )
                return False

            # Se encontrou, apaga do banco de dados.
            db.session.delete(meal_to_delete)
            db.session.commit()
            logger.info("Refeição ID %s apagada com sucesso para o usuário ID %s.", meal_id, user_id)
            return True

        except SQLAlchemyError:
            db.session.rollback()
            logger.exception(
                "Erro de banco de dados ao tentar apagar a refeição ID %s para o usuário ID %s.",
                meal_id,
                user_id
            )
            return False

    def update_meal(self, meal_id: int, user_id: int, update_data: dict) -> Optional[Meal]:
        """
        Atualiza os dados de uma refeição existente, verificando a propriedade.

        Args:
            meal_id: O ID da refeição a ser atualizada.
            user_id: O ID do usuário que está fazendo a requisição.
            update_data: Um dicionário com os campos a serem atualizados.

        Returns:
            A instância da refeição atualizada ou None se não for encontrada.
        """
        try:
            meal_to_update = Meal.query.filter_by(id=meal_id, user_id=user_id).first()

            if not meal_to_update:
                logger.warning(
                    "Tentativa de atualização falhou: Refeição ID %s não encontrada para o usuário ID %s.",
                    meal_id, user_id
                )
                return None

            items = update_data.get("items")

            if items:
                aggregate = self._aggregate_from_items(items)
                meal_to_update.description = aggregate["description"]
                meal_to_update.calories = aggregate["calories"]
                meal_to_update.protein_g = aggregate["protein_g"]
                meal_to_update.carbs_g = aggregate["carbs_g"]
                meal_to_update.fat_g = aggregate["fat_g"]
                meal_to_update.quantity_g = aggregate["quantity_g"]
                meal_to_update.items = items
            else:
                # Atualiza apenas os campos fornecidos (refeição sem detalhamento por item)
                meal_to_update.description = update_data.get("description", meal_to_update.description)
                meal_to_update.calories = float(update_data.get("calories", meal_to_update.calories))
                meal_to_update.protein_g = float(update_data.get("protein_g", meal_to_update.protein_g))
                meal_to_update.carbs_g = float(update_data.get("carbs_g", meal_to_update.carbs_g))
                meal_to_update.fat_g = float(update_data.get("fat_g", meal_to_update.fat_g))
                meal_to_update.quantity_g = float(update_data.get("quantity_g", meal_to_update.quantity_g))

            db.session.commit()
            return meal_to_update
        except (SQLAlchemyError, ValueError):
            db.session.rollback()
            logger.exception("Erro ao atualizar refeição ID %s.", meal_id)
            return None

    def get_weekly_summary(self, user_id: int) -> dict:
        """
        Calcula o resumo nutricional dos últimos 7 dias para um usuário.

        Args:
            user_id: O ID do usuário.

        Returns:
            Um dicionário com a média semanal e os dados de cada dia.
        """
        today = datetime.utcnow().date()
        seven_days_ago = today - timedelta(days=6)

        # Antes, o agrupamento por dia era feito no SQL com func.date(created_at)
        # — no SQLite isso devolve uma string ("2026-07-27"), mas no Postgres
        # devolve um objeto date de verdade. O código então indexava um dict
        # Python usando essa string como chave; no Postgres a chave nunca
        # batia (date != str) e o resumo semanal vinha sempre zerado, sem
        # nenhum erro. func.date(...) também impedia o uso do índice composto
        # (user_id, created_at) — a comparação exigia calcular a função em
        # cada linha da tabela.
        #
        # Aqui buscamos só as linhas cruas dentro da janela de 7 dias (usando
        # BETWEEN direto em created_at, que usa o índice normalmente) e
        # agrupamos em Python com row.created_at.date() — sempre um objeto
        # date nativo, em qualquer banco.
        range_start, _ = day_bounds(seven_days_ago)
        _, range_end = day_bounds(today)

        rows = db.session.query(
            Meal.created_at, Meal.calories, Meal.protein_g
        ).filter(
            Meal.user_id == user_id,
            Meal.created_at >= range_start,
            Meal.created_at <= range_end,
        ).all()

        stats_by_day = {}
        for created_at, calories, protein_g in rows:
            day = created_at.date()
            entry = stats_by_day.setdefault(day, {"calories": 0.0, "protein_g": 0.0})
            entry["calories"] += calories or 0
            entry["protein_g"] += protein_g or 0

        # Preenche os dias sem refeições com valores zerados
        week_data = []
        day_names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        for i in range(7):
            current_day = seven_days_ago + timedelta(days=i)
            day_stats = stats_by_day.get(current_day)
            week_data.append({
                "date": current_day.strftime('%Y-%m-%d'),
                "day_name": day_names[current_day.weekday()],
                "calories": float(day_stats["calories"]) if day_stats else 0,
                "protein_g": float(day_stats["protein_g"]) if day_stats else 0,
            })

        return {"days": week_data}