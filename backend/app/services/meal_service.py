import logging
from io import BytesIO
from datetime import date, datetime, timedelta
from typing import Iterable, Optional


from PIL import Image
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db 
from app.models.meal import Meal
from app.services.gemini_service import GeminiService, MealAnalysisResult


def _parse_date_str(date_str: Optional[str]) -> date:
    """Converte uma string YYYY-MM-DD para um objeto date. Usa a data atual como fallback."""
    """Converte uma string YYYY-MM-DD para um objeto date. Usa a data atual como fallback."""
    if date_str:
        try:
            # Converte a string para um objeto date
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass  # Ignora e usa o fallback se o formato for inválido ou o valor for None
    return datetime.utcnow().date()

logger = logging.getLogger(__name__)

class MealService:
    """Camada de aplicação: orquestra a análise de IA e a persistência.

    As rotas (camada HTTP) não sabem nada sobre Gemini nem sobre SQLAlchemy
    diretamente — apenas chamam este serviço.
    """

    def __init__(self, gemini_service: GeminiService):
        self._gemini_service = gemini_service

    # 1. APENAS ANALISA A IMAGEM (Não salva mais no banco)
    def analyze_image(self, image_bytes: bytes) -> dict:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._gemini_service.analyze_image(image)
        
        # Retorna um dicionário com a estimativa da IA
        return {
            "description": result.description,
            "calories": result.calories,
            "protein_g": result.protein_g,
            "carbs_g": result.carbs_g,
            "fat_g": result.fat_g,
            "confidence": result.confidence,
            "source_type": "image"
        }

    # 2. APENAS ANALISA O TEXTO (Não salva mais no banco)
    def analyze_text(self, description: str) -> dict:
        result = self._gemini_service.analyze_text(description)
        
        return {
            "description": result.description,
            "calories": result.calories,
            "protein_g": result.protein_g,
            "carbs_g": result.carbs_g,
            "fat_g": result.fat_g,
            "confidence": result.confidence,
            "source_type": "text"
        }

    # 3. NOVO MÉTODO: SALVA A REFEIÇÃO (Recebe os dados confirmados do celular)
    def save_meal(self, meal_data: dict, date_str: Optional[str], user_id: int) -> Meal:
        target_date = _parse_date_str(date_str)
        creation_timestamp = datetime.combine(target_date, datetime.utcnow().time())

        # Cria a refeição no banco com os dados que o usuário confirmou na tela
        meal = Meal(
            description=meal_data.get("description", "Refeição"),
            calories=meal_data.get("calories", 0),
            protein_g=meal_data.get("protein_g", 0),
            carbs_g=meal_data.get("carbs_g", 0),
            fat_g=meal_data.get("fat_g", 0),
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
        return {
            "total_calories": sum(m.calories for m in meals),
            "total_protein_g": sum(m.protein_g for m in meals),
            "total_carbs_g": sum(m.carbs_g for m in meals),
            "total_fat_g": sum(m.fat_g for m in meals),
            "meals_count": len(meals),
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

            # Atualiza apenas os campos fornecidos
            meal_to_update.description = update_data.get("description", meal_to_update.description)
            meal_to_update.calories = float(update_data.get("calories", meal_to_update.calories))
            meal_to_update.protein_g = float(update_data.get("protein_g", meal_to_update.protein_g))
            meal_to_update.carbs_g = float(update_data.get("carbs_g", meal_to_update.carbs_g))
            meal_to_update.fat_g = float(update_data.get("fat_g", meal_to_update.fat_g))

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

        # Agrupa as refeições por dia e soma os macros
        daily_stats = db.session.query(
            func.date(Meal.created_at).label('day'),
            func.sum(Meal.calories).label('total_calories'),
            func.sum(Meal.protein_g).label('total_protein_g')
        ).filter(
            Meal.user_id == user_id,
            func.date(Meal.created_at) >= seven_days_ago,
            func.date(Meal.created_at) <= today
        ).group_by('day').order_by('day').all()

        # Cria um mapa de data para estatísticas para fácil acesso
        # A função func.date() pode retornar uma string em vez de um objeto de data (dependendo do DB), então usamos diretamente.
        stats_map = {stat.day: stat for stat in daily_stats}

        # Preenche os dias sem refeições com valores zerados
        week_data = []
        day_names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        for i in range(7):
            current_day = seven_days_ago + timedelta(days=i)
            day_str = current_day.strftime('%Y-%m-%d')
            day_stats = stats_map.get(day_str)
            week_data.append({
                "date": day_str,
                "day_name": day_names[current_day.weekday()],
                "calories": float(day_stats.total_calories) if day_stats else 0,
                "protein_g": float(day_stats.total_protein_g) if day_stats else 0,
            })

        return {"days": week_data}