"""Regressão: resumo semanal não pode depender de como o banco devolve func.date().

Antes, get_weekly_summary agrupava por dia no SQL com func.date(created_at) e
depois indexava um dict Python usando o valor devolvido como chave. No SQLite
isso funciona (devolve string, mesma coisa usada como chave de busca), mas no
Postgres func.date() devolve um objeto `date` de verdade — a busca no dict
nunca batia e o gráfico semanal vinha sempre zerado, sem erro nenhum. Como o
bug só se manifesta num engine que este ambiente de teste não tem (Postgres),
a prova aqui é em duas partes: (1) correção funcional dos totais por dia
(vale em qualquer engine), e (2) uma trava estrutural — a implementação não
pode voltar a usar func.date() nem perder o uso do índice composto, que é
exatamente o que causava os dois problemas ao mesmo tempo.
"""
import inspect
from datetime import datetime, timedelta

from sqlalchemy import text

from app.extensions import db
from app.models import Meal, User
from app.services import meal_service as meal_service_module
from app.services.meal_service import MealService
from app.services.gemini_service import GeminiService


def _make_user(email="weekly@example.com"):
    user = User(name="Weekly Test", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


def _add_meal(user_id, when, calories, protein_g):
    meal = Meal(
        user_id=user_id,
        description="teste",
        calories=calories,
        protein_g=protein_g,
        carbs_g=0,
        fat_g=0,
        created_at=when,
    )
    db.session.add(meal)
    db.session.commit()
    return meal


def _explain(query) -> str:
    compiled = query.statement.compile(
        dialect=db.engine.dialect, compile_kwargs={"literal_binds": True}
    )
    rows = db.session.execute(text(f"EXPLAIN QUERY PLAN {compiled}")).fetchall()
    return " | ".join(str(row) for row in rows)


class TestResumoSemanalCorretude:
    def test_soma_calorias_e_proteina_por_dia_corretamente(self, app):
        with app.app_context():
            user = _make_user()
            today = datetime.utcnow().date()

            # Duas refeições no mesmo dia (hoje) devem somar.
            _add_meal(user.id, datetime.combine(today, datetime.min.time()).replace(hour=8), 300, 20)
            _add_meal(user.id, datetime.combine(today, datetime.min.time()).replace(hour=19), 500, 30)
            # Uma refeição 3 dias atrás, num dia isolado.
            three_days_ago = today - timedelta(days=3)
            _add_meal(user.id, datetime.combine(three_days_ago, datetime.min.time()).replace(hour=12), 400, 25)

            service = MealService(lambda: GeminiService(api_key="fake"))
            summary = service.get_weekly_summary(user.id)

            days_by_date = {d["date"]: d for d in summary["days"]}
            assert days_by_date[today.strftime("%Y-%m-%d")]["calories"] == 800
            assert days_by_date[today.strftime("%Y-%m-%d")]["protein_g"] == 50
            assert days_by_date[three_days_ago.strftime("%Y-%m-%d")]["calories"] == 400
            assert days_by_date[three_days_ago.strftime("%Y-%m-%d")]["protein_g"] == 25

    def test_dias_sem_refeicao_vem_zerados(self, app):
        with app.app_context():
            user = _make_user("weekly2@example.com")
            service = MealService(lambda: GeminiService(api_key="fake"))
            summary = service.get_weekly_summary(user.id)

            assert len(summary["days"]) == 7
            for day in summary["days"]:
                assert day["calories"] == 0
                assert day["protein_g"] == 0

    def test_refeicao_de_outro_usuario_nao_entra_na_soma(self, app):
        with app.app_context():
            user_a = _make_user("weekly3a@example.com")
            user_b = _make_user("weekly3b@example.com")
            today = datetime.utcnow().date()
            _add_meal(user_b.id, datetime.combine(today, datetime.min.time()), 999, 99)

            service = MealService(lambda: GeminiService(api_key="fake"))
            summary = service.get_weekly_summary(user_a.id)
            for day in summary["days"]:
                assert day["calories"] == 0


class TestResumoSemanalNaoDependeDeFuncDate:
    """func.date() é a raiz dos dois bugs (tipo de retorno inconsistente entre
    bancos + impede o uso do índice). Trava que ele não volte a aparecer
    aqui, mesmo que o teste de correção funcional não pegue essa regressão
    específica no SQLite (onde func.date() "funciona por acidente")."""

    def test_implementacao_nao_usa_func_date(self):
        source = inspect.getsource(meal_service_module.MealService.get_weekly_summary)
        code_lines = [line for line in source.splitlines() if not line.strip().startswith("#")]
        code_only = "\n".join(code_lines)
        assert "func.date" not in code_only, (
            "get_weekly_summary voltou a usar func.date() para agrupar por dia "
            "— isso quebra silenciosamente no Postgres (func.date devolve um "
            "objeto date, não uma string, e a busca no dict de estatísticas "
            "nunca bate) e impede o uso do índice composto "
            "ix_meals_user_id_created_at."
        )

    def test_consulta_usa_o_indice_composto_em_vez_de_scan(self, app):
        with app.app_context():
            user = _make_user("weekly4@example.com")
            query = db.session.query(Meal.created_at, Meal.calories, Meal.protein_g).filter(
                Meal.user_id == user.id,
                Meal.created_at >= datetime.utcnow() - timedelta(days=7),
                Meal.created_at <= datetime.utcnow(),
            )
            plan = _explain(query)
            assert "ix_meals_user_id_created_at" in plan
