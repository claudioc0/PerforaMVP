import logging
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models import WeeklyPlan, WeeklyPlanDay, WorkoutSplit, SplitDay, UserGoals

logger = logging.getLogger(__name__)

DAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

REST_SUGGESTIONS = {
    "lose": (
        "Descanso ativo: 1h de cardio moderado (caminhada rápida, bike ou natação) "
        "— ajuda no déficit calórico da sua meta de perder peso."
    ),
    "gain": (
        "Descanso: priorize sono e alimentação para a recuperação muscular. Se quiser "
        "se mover, uma caminhada leve de 20-30min não atrapalha o ganho de massa."
    ),
    "maintain": (
        "Descanso ativo opcional: uma caminhada leve de 30min ou alongamento ajuda a "
        "manter o corpo em movimento sem sobrecarregar."
    ),
}


class WeeklyPlanService:
    """Camada de serviço para o plano semanal de treino (Segunda a Domingo),
    gerado a partir de uma divisão escolhida. Dias sem exercício sugerido viram
    dias de descanso, com uma sugestão de descanso ativo conforme o objetivo
    nutricional do usuário (`UserGoals.goal_type`).
    """

    def _rest_suggestion(self, user_id: int) -> str:
        goals = UserGoals.query.filter_by(user_id=user_id).first()
        goal_type = goals.goal_type if goals and goals.goal_type else "maintain"
        return REST_SUGGESTIONS.get(goal_type, REST_SUGGESTIONS["maintain"])

    def get_plan(self, user_id: int) -> Optional[dict]:
        plan = WeeklyPlan.query.filter_by(user_id=user_id).first()
        if not plan:
            return None
        return self._serialize(plan, user_id)

    def create_or_replace_plan(
        self, user_id: int, split_id: int, split_day_ids: Optional[list] = None
    ) -> Optional[dict]:
        """Substitui o plano semanal do usuário por um novo, gerado a partir da
        divisão informada.

        Por padrão (`split_day_ids=None`), cada dia da divisão ocupa um dia da
        semana a partir de Segunda, na ordem cadastrada, e os dias restantes
        viram descanso — a escala padrão.

        Quando `split_day_ids` é informado (1 a 7 IDs de `SplitDay` da própria
        divisão, repetições permitidas), ele define explicitamente o treino de
        cada dia a partir de Segunda — usado quando o usuário escolhe treinar
        mais (ou menos) dias por semana do que a divisão tem originalmente,
        repetindo os treinos que preferir.
        """
        split = WorkoutSplit.query.get(split_id)
        if not split:
            return None

        split_days = SplitDay.query.filter_by(split_id=split_id).order_by(SplitDay.order).all()
        if not split_days:
            return None

        if split_day_ids is not None:
            if not split_day_ids or len(split_day_ids) > 7:
                return None
            valid_ids = {sd.id for sd in split_days}
            if not all(sid in valid_ids for sid in split_day_ids):
                return None
            ordered_ids = list(split_day_ids)
        else:
            ordered_ids = [sd.id for sd in split_days]

        try:
            existing = WeeklyPlan.query.filter_by(user_id=user_id).first()
            if existing:
                db.session.delete(existing)
                db.session.flush()

            plan = WeeklyPlan(user_id=user_id, split_id=split_id)
            db.session.add(plan)
            db.session.flush()

            for day_of_week in range(7):
                split_day_id = ordered_ids[day_of_week] if day_of_week < len(ordered_ids) else None
                db.session.add(WeeklyPlanDay(
                    plan_id=plan.id,
                    day_of_week=day_of_week,
                    split_day_id=split_day_id,
                ))

            db.session.commit()
            return self._serialize(plan, user_id)
        except SQLAlchemyError:
            db.session.rollback()
            logger.exception("Erro ao criar plano semanal para usuário ID %s.", user_id)
            return None

    def update_day(self, user_id: int, day_of_week: int, split_day_id: Optional[int]) -> Optional[dict]:
        """Reatribui manualmente um dia da semana: para outro dia da mesma
        divisão, ou para descanso (`split_day_id=None`).
        """
        plan = WeeklyPlan.query.filter_by(user_id=user_id).first()
        if not plan:
            return None

        if split_day_id is not None:
            valid = SplitDay.query.filter_by(id=split_day_id, split_id=plan.split_id).first()
            if not valid:
                return None

        day = WeeklyPlanDay.query.filter_by(plan_id=plan.id, day_of_week=day_of_week).first()
        if not day:
            return None

        try:
            day.split_day_id = split_day_id
            db.session.commit()
            return self._serialize(plan, user_id)
        except SQLAlchemyError:
            db.session.rollback()
            logger.exception(
                "Erro ao atualizar dia %s do plano semanal do usuário ID %s.", day_of_week, user_id
            )
            return None

    def delete_plan(self, user_id: int) -> bool:
        plan = WeeklyPlan.query.filter_by(user_id=user_id).first()
        if not plan:
            return False

        try:
            db.session.delete(plan)
            db.session.commit()
            return True
        except SQLAlchemyError:
            db.session.rollback()
            logger.exception("Erro ao apagar plano semanal do usuário ID %s.", user_id)
            return False

    def _serialize(self, plan: WeeklyPlan, user_id: int) -> dict:
        split = WorkoutSplit.query.get(plan.split_id)
        split_days = SplitDay.query.filter_by(split_id=plan.split_id).order_by(SplitDay.order).all()
        plan_days = {d.day_of_week: d for d in WeeklyPlanDay.query.filter_by(plan_id=plan.id).all()}

        days = []
        for day_of_week in range(7):
            plan_day = plan_days.get(day_of_week)
            split_day = None
            if plan_day and plan_day.split_day_id:
                split_day = next((sd for sd in split_days if sd.id == plan_day.split_day_id), None)
            days.append({
                "day_of_week": day_of_week,
                "day_label": DAY_LABELS[day_of_week],
                "split_day_id": split_day.id if split_day else None,
                "split_day_name": split_day.name if split_day else None,
            })

        return {
            "split_id": split.id,
            "split_name": split.name,
            "split_days": [sd.to_dict() for sd in split_days],
            "active_rest_suggestion": self._rest_suggestion(user_id),
            "days": days,
        }
