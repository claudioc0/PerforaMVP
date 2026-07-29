"""StreakService: sequência de dias consecutivos com refeição OU treino
registrado (streak combinada, não duas separadas).
"""
from datetime import date, datetime, timedelta

from app.extensions import db
from app.models import Meal, User, Workout
from app.services.streak_service import StreakService, compute_streak_from_dates


class TestComputeStreakFromDates:
    """Pura, sem DB — só a matemática de dias consecutivos."""

    def test_sequencia_terminando_hoje(self):
        today = date(2026, 7, 29)
        active = {today, today - timedelta(days=1), today - timedelta(days=2)}
        assert compute_streak_from_dates(active, today) == 3

    def test_sequencia_terminando_ontem_com_hoje_ainda_vazio(self):
        # Hoje ainda não tem registro (usuário ainda não tomou café da manhã),
        # mas ontem e anteontem tiveram — o contador não deve zerar.
        today = date(2026, 7, 29)
        active = {today - timedelta(days=1), today - timedelta(days=2)}
        assert compute_streak_from_dates(active, today) == 2

    def test_gap_quebra_a_sequencia(self):
        today = date(2026, 7, 29)
        active = {today, today - timedelta(days=2)}  # falta ontem
        assert compute_streak_from_dates(active, today) == 1

    def test_conjunto_vazio_devolve_zero(self):
        assert compute_streak_from_dates(set(), date(2026, 7, 29)) == 0

    def test_um_unico_dia(self):
        today = date(2026, 7, 29)
        assert compute_streak_from_dates({today}, today) == 1


def _make_user(email):
    user = User(name="Teste Streak", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestStreakServiceEscopadaPorUsuario:
    def test_nao_conta_atividade_de_outro_usuario(self, app):
        with app.app_context():
            user_a = _make_user("streak-a@example.com")
            user_b = _make_user("streak-b@example.com")
            today = datetime.utcnow()

            # Usuário A: só uma refeição hoje.
            db.session.add(Meal(
                user_id=user_a.id, description="Refeição A",
                calories=100, protein_g=1, carbs_g=1, fat_g=1, created_at=today,
            ))
            # Usuário B: um treino hoje e ontem — não deve vazar pro streak de A.
            db.session.add(Workout(user_id=user_b.id, started_at=today))
            db.session.add(Workout(user_id=user_b.id, started_at=today - timedelta(days=1)))
            db.session.commit()

            result = StreakService().get_current_streak(user_a.id, today.date().strftime("%Y-%m-%d"))

            assert result == {"current_streak": 1, "active_today": True}

    def test_conta_refeicao_ou_treino_do_mesmo_usuario(self, app):
        with app.app_context():
            user = _make_user("streak-combo@example.com")
            today = datetime.utcnow()

            # Hoje: refeição. Ontem: só treino (sem refeição). Streak combinada
            # conta os dois — não deveria quebrar entre eles.
            db.session.add(Meal(
                user_id=user.id, description="Refeição hoje",
                calories=100, protein_g=1, carbs_g=1, fat_g=1, created_at=today,
            ))
            db.session.add(Workout(user_id=user.id, started_at=today - timedelta(days=1)))
            db.session.commit()

            result = StreakService().get_current_streak(user.id, today.date().strftime("%Y-%m-%d"))

            assert result == {"current_streak": 2, "active_today": True}
