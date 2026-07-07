from io import BytesIO
from datetime import date, datetime
from typing import Iterable, Optional

from PIL import Image

from app.extensions import db
from app.models.meal import Meal
from app.services.gemini_service import GeminiService, MealAnalysisResult


def _parse_date_str(date_str: Optional[str]) -> date:
    """Converte uma string YYYY-MM-DD para um objeto date. Usa a data atual como fallback."""
    if date_str:
        try:
            # Converte a string para um objeto date
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass  # Ignora e usa o fallback se o formato for inválido ou o valor for None
    return datetime.utcnow().date()

class MealService:
    """Camada de aplicação: orquestra a análise de IA e a persistência.

    As rotas (camada HTTP) não sabem nada sobre Gemini nem sobre SQLAlchemy
    diretamente — apenas chamam este serviço.
    """

    def __init__(self, gemini_service: GeminiService):
        self._gemini_service = gemini_service

    def analyze_and_store_image(self, image_bytes: bytes, date_str: Optional[str], user_id: int) -> Meal:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._gemini_service.analyze_image(image)
        return self._create_and_persist_meal(result, "image", date_str, user_id)

    def analyze_and_store_text(self, description: str, date_str: Optional[str], user_id: int) -> Meal:
        result = self._gemini_service.analyze_text(description)
        return self._create_and_persist_meal(result, "text", date_str, user_id)

    def _create_and_persist_meal(self, result: MealAnalysisResult, source_type: str, date_str: Optional[str], user_id: int) -> Meal:
        """Método centralizador para criar e salvar uma refeição."""
        target_date = _parse_date_str(date_str)
        creation_timestamp = datetime.combine(target_date, datetime.utcnow().time())

        meal = Meal(
            description=result.description,
            calories=result.calories,
            protein_g=result.protein_g,
            carbs_g=result.carbs_g,
            fat_g=result.fat_g,
            confidence=result.confidence,
            source_type=source_type,
            created_at=creation_timestamp,
            user_id=user_id,
        )
        return self._persist(meal)

    @staticmethod
    def _persist(meal: Meal) -> Meal:
        """Adiciona a refeição à sessão e a salva no banco de dados."""
        if not meal.user_id:
            raise ValueError("A refeição deve estar associada a um usuário (user_id).")

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