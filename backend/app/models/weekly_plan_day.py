from app.extensions import db


class WeeklyPlanDay(db.Model):
    """Um dia da semana (0=Segunda ... 6=Domingo) dentro do plano semanal do
    usuário. `split_day_id` nulo significa dia de descanso.
    """

    __tablename__ = "weekly_plan_days"
    __table_args__ = (
        db.UniqueConstraint("plan_id", "day_of_week", name="uq_weekly_plan_day"),
    )

    id = db.Column(db.Integer, primary_key=True)
    plan_id = db.Column(db.Integer, db.ForeignKey("weekly_plans.id"), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    split_day_id = db.Column(db.Integer, db.ForeignKey("split_days.id"), nullable=True)

    def to_dict(self):
        return {
            "day_of_week": self.day_of_week,
            "split_day_id": self.split_day_id,
        }
