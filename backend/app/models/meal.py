from datetime import datetime, date
from app.extensions import db


class Meal(db.Model):
    """Representa uma refeição analisada e registrada no histórico do usuário."""

    __tablename__ = "meals"

    id = db.Column(db.Integer, primary_key=True)

    # Nome/descrição do prato identificado pela IA (ex: "Arroz, feijão e frango grelhado")
    description = db.Column(db.String(255), nullable=False)

    calories = db.Column(db.Float, nullable=False, default=0)
    protein_g = db.Column(db.Float, nullable=False, default=0)
    carbs_g = db.Column(db.Float, nullable=False, default=0)
    fat_g = db.Column(db.Float, nullable=False, default=0)

    # Guardamos a origem (foto ou texto) e um nível de confiança opcional da IA
    source_type = db.Column(db.String(10), nullable=False, default="image")  # image | text
    confidence = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
        }

    @staticmethod
    def query_today():
        """Retorna todas as refeições registradas no dia atual (UTC)."""
        today = date.today()
        start = datetime.combine(today, datetime.min.time())
        end = datetime.combine(today, datetime.max.time())
        return Meal.query.filter(Meal.created_at.between(start, end)).order_by(Meal.created_at.asc())
