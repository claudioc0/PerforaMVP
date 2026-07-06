from io import BytesIO
from typing import Iterable

from PIL import Image

from app.extensions import db
from app.models.meal import Meal
from app.services.gemini_service import GeminiService, MealAnalysisResult


class MealService:
    """Camada de aplicação: orquestra a análise de IA e a persistência.

    As rotas (camada HTTP) não sabem nada sobre Gemini nem sobre SQLAlchemy
    diretamente — apenas chamam este serviço.
    """

    def __init__(self, gemini_service: GeminiService):
        self._gemini_service = gemini_service

    def analyze_and_store_image(self, image_bytes: bytes) -> Meal:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = self._gemini_service.analyze_image(image)
        return self._persist(result, source_type="image")

    def analyze_and_store_text(self, description: str) -> Meal:
        result = self._gemini_service.analyze_text(description)
        return self._persist(result, source_type="text")

    @staticmethod
    def _persist(result: MealAnalysisResult, source_type: str) -> Meal:
        meal = Meal(
            description=result.description,
            calories=result.calories,
            protein_g=result.protein_g,
            carbs_g=result.carbs_g,
            fat_g=result.fat_g,
            confidence=result.confidence,
            source_type=source_type,
        )
        db.session.add(meal)
        db.session.commit()
        return meal

    @staticmethod
    def get_today_meals() -> Iterable[Meal]:
        return Meal.query_today().all()

    @staticmethod
    def get_today_summary() -> dict:
        meals = MealService.get_today_meals()
        summary = {
            "total_calories": sum(m.calories for m in meals),
            "total_protein_g": sum(m.protein_g for m in meals),
            "total_carbs_g": sum(m.carbs_g for m in meals),
            "total_fat_g": sum(m.fat_g for m in meals),
            "meals_count": len(meals),
            "meals": [m.to_dict() for m in meals],
        }
        return summary
