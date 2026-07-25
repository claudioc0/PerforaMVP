import re
from typing import Optional

from app.extensions import db
from app.models import Exercise


class ExerciseService:
    """Camada de serviço para o catálogo global de exercícios.

    Mesma lógica de deduplicação do FoodCache: normaliza o nome antes de
    comparar, pra evitar duplicatas como "Supino Reto" / "supino reto".
    """

    def _normalize(self, text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().lower())

    def search_exercises(self, query: Optional[str] = None, muscle_group: Optional[str] = None) -> list:
        """Busca no catálogo, opcionalmente filtrando por texto e/ou grupo muscular."""
        q = Exercise.query

        if muscle_group:
            q = q.filter(Exercise.muscle_group == muscle_group)

        if query:
            normalized_query = self._normalize(query)
            q = q.filter(Exercise.normalized_name.contains(normalized_query))

        return q.order_by(Exercise.name).all()

    def create_custom_exercise(self, data: dict) -> Exercise:
        """Cria um exercício customizado. Se já existir um com o mesmo nome
        normalizado, retorna o existente em vez de duplicar.
        """
        name = data.get("name", "").strip()
        normalized_name = self._normalize(name)

        existing = Exercise.query.filter_by(normalized_name=normalized_name).first()
        if existing:
            return existing

        exercise = Exercise(
            name=name,
            normalized_name=normalized_name,
            muscle_group=data.get("muscle_group", "outro"),
            equipment=data.get("equipment"),
            is_custom=True,
        )
        db.session.add(exercise)
        db.session.commit()
        return exercise
