from datetime import datetime

from app.extensions import db


class Exercise(db.Model):
    """Catálogo global de exercícios, compartilhado entre todos os usuários.

    Mesma lógica do FoodCache: cresce com o uso (usuários podem cadastrar
    exercícios customizados) e é deduplicado por nome normalizado, pra não
    acumular entradas repetidas como "Supino Reto" e "supino reto".
    """

    __tablename__ = "exercises"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(120), nullable=False)
    normalized_name = db.Column(db.String(120), unique=True, index=True, nullable=False)
    muscle_group = db.Column(db.String(30), nullable=False)
    equipment = db.Column(db.String(50), nullable=True)

    # True quando criado pelo usuário via POST /api/workouts/exercises,
    # False para os exercícios pré-cadastrados na migration.
    is_custom = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "muscle_group": self.muscle_group,
            "equipment": self.equipment,
            "is_custom": self.is_custom,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
