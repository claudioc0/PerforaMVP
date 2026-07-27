from datetime import datetime

from app.extensions import db


class SetLog(db.Model):
    """Uma série registrada dentro de um treino — tabela relacional de verdade
    (não um JSON blob), para permitir agregações futuras (ex: tonelagem total
    por dia, cruzada com macros) sem precisar migrar o schema depois.
    """

    __tablename__ = "set_logs"

    id = db.Column(db.Integer, primary_key=True)
    # Toda leitura de séries filtra por workout_id (get_workout_detail,
    # get_workout_progress, etc.) — sem índice, cresce como uma varredura completa
    # conforme o histórico de treinos acumula.
    workout_id = db.Column(db.Integer, db.ForeignKey("workouts.id"), nullable=False, index=True)
    exercise_id = db.Column(db.Integer, db.ForeignKey("exercises.id"), nullable=False)

    # Ordem da série para esse exercício dentro do treino (1a série, 2a série...)
    set_number = db.Column(db.Integer, nullable=False)
    weight_kg = db.Column(db.Float, nullable=False, default=0)
    reps = db.Column(db.Integer, nullable=False, default=0)

    # Descanso real tomado antes dessa série (do timer do app), para
    # análises futuras de recuperação.
    rest_seconds = db.Column(db.Integer, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "workout_id": self.workout_id,
            "exercise_id": self.exercise_id,
            "set_number": self.set_number,
            "weight_kg": self.weight_kg,
            "reps": self.reps,
            "rest_seconds": self.rest_seconds,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
