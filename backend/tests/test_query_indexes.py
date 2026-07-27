"""Prova que os índices novos são realmente usados pelas consultas do app.

Ter o índice criado é uma coisa; o SQLite (ou qualquer banco) só usar esse
índice de fato é outra — por isso aqui rodamos EXPLAIN QUERY PLAN nas MESMAS
consultas que os services emitem em produção, e afirmamos que o plano cita o
índice em vez de "SCAN" (varredura completa da tabela).
"""

from sqlalchemy import text

from app.extensions import db
from app.models import Meal, Workout, SetLog, WeightLog


def _explain(query) -> str:
    """Devolve o texto completo do EXPLAIN QUERY PLAN de uma Query do SQLAlchemy."""
    compiled = query.statement.compile(
        dialect=db.engine.dialect, compile_kwargs={"literal_binds": True}
    )
    rows = db.session.execute(text(f"EXPLAIN QUERY PLAN {compiled}")).fetchall()
    return " | ".join(str(row) for row in rows)


class TestIndiceDeMeals:
    def test_query_by_date_com_filtro_de_usuario_usa_o_indice_composto(self, app):
        with app.app_context():
            query = Meal.query_by_date(__import__("datetime").date(2026, 7, 27)).filter_by(user_id=1)
            plan = _explain(query)
            assert "ix_meals_user_id_created_at" in plan
            assert "SCAN" not in plan.upper() or "SCAN TABLE meals" not in plan


class TestIndiceDeWorkouts:
    def test_filtro_por_usuario_usa_o_indice(self, app):
        with app.app_context():
            query = Workout.query.filter_by(user_id=1)
            plan = _explain(query)
            assert "ix_workouts_user_id" in plan


class TestIndiceDeSetLogs:
    def test_filtro_por_workout_usa_o_indice(self, app):
        with app.app_context():
            query = SetLog.query.filter_by(workout_id=1)
            plan = _explain(query)
            assert "ix_set_logs_workout_id" in plan


class TestIndiceDeWeightLogs:
    def test_filtro_por_usuario_usa_o_indice(self, app):
        with app.app_context():
            query = WeightLog.query.filter_by(user_id=1)
            plan = _explain(query)
            assert "ix_weight_logs_user_id" in plan
