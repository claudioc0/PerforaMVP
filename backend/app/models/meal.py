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

    # Quantidade em gramas que o usuário confirmou (a análise da IA é sempre por 100g)
    quantity_g = db.Column(db.Float, nullable=False, default=100)

    # Guardamos a origem (foto ou texto) e um nível de confiança opcional da IA
    source_type = db.Column(db.String(10), nullable=False, default="image")  # image | text
    confidence = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # NOVA COLUNA: Chave estrangeira que obriga toda refeição a ter um dono (usuário)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "quantity_g": self.quantity_g,
            "source_type": self.source_type,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
            "user_id": self.user_id, # Retornando o ID do dono da refeição
        }

    @staticmethod
    def query_by_date(target_date: date):
        """Retorna todas as refeições registradas em uma data específica (UTC)."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())
        
        # Retorna a Query base. O filtro de user_id é adicionado dinamicamente no MealService.
        return Meal.query.filter(Meal.created_at.between(start, end)).order_by(Meal.created_at.asc())