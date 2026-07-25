from app.extensions import db


class SplitDay(db.Model):
    """Um dia dentro de uma divisão de treino (ex: "Push" dentro do PPL)."""

    __tablename__ = "split_days"

    id = db.Column(db.Integer, primary_key=True)
    split_id = db.Column(db.Integer, db.ForeignKey("workout_splits.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "split_id": self.split_id,
            "name": self.name,
            "order": self.order,
        }
