from datetime import datetime

from sqlalchemy import event

from app.extensions import db


class WeightLog(db.Model):
    __tablename__ = 'weight_logs'
    __table_args__ = (
        # Nada impedia dois registros de peso no mesmo dia — o histórico
        # acumulava duplicatas silenciosamente, e o gráfico (que agrupa por
        # data) mascarava o problema em vez de expô-lo. Um registro por
        # usuário por dia.
        db.UniqueConstraint('user_id', 'log_date', name='uq_weight_logs_user_log_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    # get_weight_history filtra por user_id em toda chamada — sem índice, cresce
    # como uma varredura completa conforme o histórico de pesagens acumula.
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    weight = db.Column(db.Float, nullable=False)
    # Nome consistente com Meal.created_at e WaterLog.created_at — antes essa
    # coluna se chamava só "date", uma quarta convenção pro mesmo conceito
    # ("quando aconteceu"). workouts.started_at continua diferente de
    # propósito (marca o início de uma sessão de treino, não o instante de
    # criação do registro — a própria tabela workouts já tem os dois,
    # started_at E created_at, então não é o mesmo conceito duplicado).
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    # Dia civil da pesagem, mantido em sincronia com created_at pelo listener
    # abaixo. Existe como coluna própria (em vez de calculado a partir de
    # created_at na hora) só para a UniqueConstraint acima funcionar de forma
    # portável entre SQLite e Postgres — um índice único sobre uma expressão
    # como date(created_at) exigiria SQL específico de cada dialeto.
    log_date = db.Column(db.Date, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "weight": self.weight,
            "date": self.log_date.strftime("%Y-%m-%d"),
        }


@event.listens_for(WeightLog, "before_insert")
@event.listens_for(WeightLog, "before_update")
def _sync_log_date(mapper, connection, target: WeightLog) -> None:
    """Deriva log_date de created_at sempre que a linha é gravada — quem cria
    um WeightLog nunca precisa (nem deve) passar log_date manualmente."""
    if target.created_at is None:
        target.created_at = datetime.utcnow()
    target.log_date = target.created_at.date()
