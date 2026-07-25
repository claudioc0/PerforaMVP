from app.extensions import db


class SplitDayExercise(db.Model):
    """Lista curada e ordenada de exercícios sugeridos para um SplitDay."""

    __tablename__ = "split_day_exercises"

    id = db.Column(db.Integer, primary_key=True)
    split_day_id = db.Column(db.Integer, db.ForeignKey("split_days.id"), nullable=False)
    exercise_id = db.Column(db.Integer, db.ForeignKey("exercises.id"), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "split_day_id": self.split_day_id,
            "exercise_id": self.exercise_id,
            "order": self.order,
        }
