from datetime import date, timedelta
from typing import Optional, Set

from app.extensions import db
from app.models import Meal, Workout
from app.utils.dates import day_bounds, parse_date_str

# Uma sequência mais longa que isso é subcontada (só olhamos pra trás até
# aqui) — troca simples caso vire um problema real, não uma limitação de design.
STREAK_LOOKBACK_DAYS = 60


def compute_streak_from_dates(active_dates: Set[date], today: date) -> int:
    """Pura, sem DB. Conta dias consecutivos terminando em `today`, ou em
    `today - 1` se hoje ainda não tem nenhuma atividade registrada — assim o
    contador não zera pro usuário assim que ele acorda, antes de registrar o
    café da manhã ou treinar.
    """
    cursor = today if today in active_dates else today - timedelta(days=1)
    streak = 0
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


class StreakService:
    def get_current_streak(self, user_id: int, today_str: Optional[str] = None) -> dict:
        today = parse_date_str(today_str)
        window_start, _ = day_bounds(today - timedelta(days=STREAK_LOOKBACK_DAYS))
        _, window_end = day_bounds(today)

        meal_rows = db.session.query(Meal.created_at).filter(
            Meal.user_id == user_id,
            Meal.created_at >= window_start,
            Meal.created_at <= window_end,
        ).all()
        workout_rows = db.session.query(Workout.started_at).filter(
            Workout.user_id == user_id,
            Workout.started_at >= window_start,
            Workout.started_at <= window_end,
        ).all()

        # Agrupamento em Python (row.created_at.date()), não func.date() no SQL —
        # mesma armadilha já documentada em get_weekly_summary (meal_service.py):
        # func.date() devolve string no SQLite e um date de verdade no Postgres,
        # e também impede o uso dos índices compostos (user_id, created_at/started_at)
        # já que a comparação passaria a exigir calcular a função em cada linha.
        active_dates = {row[0].date() for row in meal_rows} | {row[0].date() for row in workout_rows}

        streak = compute_streak_from_dates(active_dates, today)
        return {"current_streak": streak, "active_today": today in active_dates}
