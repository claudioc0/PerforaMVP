from datetime import datetime

from app.extensions import db


class WeeklyPlan(db.Model):
    """Plano semanal de treino do usuário (Segunda a Domingo), gerado a partir
    de uma divisão escolhida. Um usuário tem no máximo um plano ativo por vez.
    """

    __tablename__ = "weekly_plans"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    split_id = db.Column(db.Integer, db.ForeignKey("workout_splits.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    days = db.relationship("WeeklyPlanDay", backref="plan", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "split_id": self.split_id,
        }
