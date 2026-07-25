from datetime import datetime

from app.extensions import db


class WorkoutSplit(db.Model):
    """Catálogo global de divisões de treino (Bro Split, ABCD, PPL, Upper/Lower,
    Full Body). Cada divisão tem um ou mais SplitDay.
    """

    __tablename__ = "workout_splits"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
        }
