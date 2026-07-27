from datetime import datetime

from app.extensions import db


class Workout(db.Model):
    """Uma sessão de treino do usuário. `finished_at` presente = somente leitura."""

    __tablename__ = "workouts"

    id = db.Column(db.Integer, primary_key=True)
    # Toda listagem/busca de treino filtra por user_id (list_workouts, get_workout,
    # get_workout_progress, etc.) — sem índice, cresce como uma varredura completa.
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    # Presente = treino iniciado a partir de uma divisão (Push, ABCD-A, etc).
    # Ausente = treino freestyle (fluxo original, sem roteiro sugerido).
    split_day_id = db.Column(db.Integer, db.ForeignKey("split_days.id"), nullable=True)

    name = db.Column(db.String(120), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    started_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    finished_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    sets = db.relationship("SetLog", backref="workout", lazy=True, cascade="all, delete-orphan")
    split_day = db.relationship("SplitDay", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "split_day_id": self.split_day_id,
            "split_day_name": self.split_day.name if self.split_day else None,
            "name": self.name,
            "notes": self.notes,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "is_finished": self.finished_at is not None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
