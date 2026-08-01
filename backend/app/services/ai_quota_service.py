from datetime import date

from app.extensions import db
from app.models import User

# Quantidade de análises de IA (foto de refeição ou de rótulo) que uma conta
# não-premium pode fazer por dia. Reset é sobre o dia corrente em UTC (mesmo
# relógio do servidor usado em outras contagens simples do backend) — não
# vale a pena plumbing de fuso do usuário só pra isso, diferente do resumo
# semanal/streak, onde a virada de dia errada já causou bugs reais de
# contagem de refeição.
FREE_DAILY_LIMIT = 5


class AiQuotaService:
    def check_and_consume(self, user_id: int) -> dict:
        """Verifica e já consome uma cota na mesma chamada. `with_for_update()`
        trava a linha no Postgres (produção) enquanto a transação está aberta,
        pra duas chamadas concorrentes do mesmo usuário não lerem o mesmo
        `count` antes de qualquer uma commitar o incremento — no SQLite (dev)
        a trava é ignorada, mas ali toda a conexão já serializa por escrita.

        Devolve {"allowed": bool, "remaining": int|None, "is_premium": bool}.
        `remaining=None` significa ilimitado (conta premium).
        """
        user = User.query.filter_by(id=user_id).with_for_update().first()

        if user.is_premium:
            return {"allowed": True, "remaining": None, "is_premium": True}

        today = date.today()
        if user.daily_ai_calls_date != today:
            user.daily_ai_calls_date = today
            user.daily_ai_calls_count = 0

        if user.daily_ai_calls_count >= FREE_DAILY_LIMIT:
            # Persiste o reset de data mesmo quando bloqueia (senão o próximo
            # request do dia seguinte recomeçaria comparando contra a data
            # antiga de novo, sem consequência funcional, mas sem necessidade).
            db.session.commit()
            return {"allowed": False, "remaining": 0, "is_premium": False}

        user.daily_ai_calls_count += 1
        db.session.commit()
        return {
            "allowed": True,
            "remaining": FREE_DAILY_LIMIT - user.daily_ai_calls_count,
            "is_premium": False,
        }
