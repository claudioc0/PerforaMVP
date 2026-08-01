"""Feature: relatório exportável (PDF/CSV) — build_report_data combina os
três conjuntos de dados já calculados em outro lugar (resumo semanal,
histórico de peso, progresso de treino) sem duplicar a lógica de agregação;
render_csv/render_pdf não podem lançar mesmo com dado vazio (usuário novo).
"""
from datetime import datetime

from app.extensions import db
from app.models import Exercise, Meal, SetLog, User, WeightLog, Workout
from app.services.report_service import build_report_data, render_csv, render_pdf


def _make_user(email):
    user = User(name="Teste Relatório", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


def _make_full_history(user):
    meal = Meal(
        description="Almoço", calories=500, protein_g=30, carbs_g=50, fat_g=10,
        quantity_g=300, source_type="manual", user_id=user.id,
    )
    db.session.add(meal)

    weight = WeightLog(user_id=user.id, weight=80.5, created_at=datetime.utcnow())
    db.session.add(weight)

    exercise = Exercise(name="Supino Reto", normalized_name="supino reto", muscle_group="Peito")
    db.session.add(exercise)
    db.session.commit()

    workout = Workout(user_id=user.id, name="Treino A", finished_at=datetime.utcnow())
    db.session.add(workout)
    db.session.commit()

    set_log = SetLog(workout_id=workout.id, exercise_id=exercise.id, set_number=1, weight_kg=40, reps=10, rest_seconds=90)
    db.session.add(set_log)
    db.session.commit()


class TestBuildReportData:
    def test_combina_os_tres_conjuntos_de_dados(self, app):
        with app.app_context():
            user = _make_user("relatorio-a@example.com")
            _make_full_history(user)

            data = build_report_data(user.id)

            assert len(data["weekly_summary"]) == 7
            assert any(day["calories"] == 500 for day in data["weekly_summary"])
            assert data["weight_history"] == [{"id": data["weight_history"][0]["id"], "weight": 80.5, "date": data["weight_history"][0]["date"]}]
            assert len(data["workout_progress"]) == 1
            assert data["workout_progress"][0]["name"] == "Treino A"
            assert data["workout_progress"][0]["total_tonnage"] == 400.0
            assert data["workout_progress"][0]["total_reps"] == 10

    def test_usuario_novo_sem_historico_devolve_listas_vazias(self, app):
        with app.app_context():
            user = _make_user("relatorio-b@example.com")

            data = build_report_data(user.id)

            assert len(data["weekly_summary"]) == 7
            assert all(day["calories"] == 0 for day in data["weekly_summary"])
            assert data["weight_history"] == []
            assert data["workout_progress"] == []


class TestRenderCsv:
    def test_inclui_as_tres_secoes_com_titulo(self, app):
        with app.app_context():
            user = _make_user("relatorio-c@example.com")
            _make_full_history(user)

            csv_text = render_csv(build_report_data(user.id))

            assert "Resumo Semanal" in csv_text
            assert "Histórico de Peso" in csv_text
            assert "Progresso de Treino" in csv_text
            assert "Treino A" in csv_text
            assert "80.5" in csv_text

    def test_nao_lanca_com_dado_vazio(self, app):
        with app.app_context():
            user = _make_user("relatorio-d@example.com")

            csv_text = render_csv(build_report_data(user.id))

            assert "Resumo Semanal" in csv_text


class TestRenderPdf:
    def test_devolve_bytes_de_pdf_valido(self, app):
        with app.app_context():
            user = _make_user("relatorio-e@example.com")
            _make_full_history(user)

            pdf_bytes = render_pdf(build_report_data(user.id), user.name)

            assert pdf_bytes.startswith(b"%PDF")

    def test_nao_lanca_com_dado_vazio(self, app):
        with app.app_context():
            user = _make_user("relatorio-f@example.com")

            pdf_bytes = render_pdf(build_report_data(user.id), user.name)

            assert pdf_bytes.startswith(b"%PDF")
