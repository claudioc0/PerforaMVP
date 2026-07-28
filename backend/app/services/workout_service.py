import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError

from app.extensions import db
from app.models import Workout, SetLog, Exercise
from app.utils.pagination import paginate_query

logger = logging.getLogger(__name__)


class WorkoutService:
    """Camada de serviço para sessões de treino e suas séries."""

    def create_workout(self, user_id: int, data: dict) -> Workout:
        workout = Workout(
            user_id=user_id,
            name=data.get("name"),
            split_day_id=data.get("split_day_id"),
        )
        db.session.add(workout)
        db.session.commit()
        return workout

    def get_workouts_for_user(self, user_id: int, page: int, per_page: int) -> tuple:
        """Devolve (treinos, total) da página pedida, mais recente primeiro."""
        query = Workout.query.filter_by(user_id=user_id).order_by(Workout.started_at.desc())
        return paginate_query(query, page, per_page)

    def get_workout_detail(self, workout_id: int, user_id: int) -> Optional[dict]:
        """Retorna o treino com suas séries, já com nome/grupo do exercício resolvidos."""
        workout = Workout.query.filter_by(id=workout_id, user_id=user_id).first()
        if not workout:
            return None

        result = workout.to_dict()
        sets = SetLog.query.filter_by(workout_id=workout_id).order_by(SetLog.id).all()

        # Antes, cada série disparava sua própria query pra resolver o
        # exercício (Exercise.query.get dentro do loop) — um treino de 40
        # séries virava 41 queries. Busca todos os exercícios envolvidos de
        # uma vez só, fora do loop.
        exercise_ids = {s.exercise_id for s in sets}
        exercises_by_id = (
            {e.id: e for e in Exercise.query.filter(Exercise.id.in_(exercise_ids)).all()}
            if exercise_ids else {}
        )

        enriched_sets = []
        for set_log in sets:
            set_dict = set_log.to_dict()
            exercise = exercises_by_id.get(set_log.exercise_id)
            set_dict["exercise_name"] = exercise.name if exercise else None
            set_dict["muscle_group"] = exercise.muscle_group if exercise else None
            enriched_sets.append(set_dict)

        result["sets"] = enriched_sets
        return result

    def update_workout(self, workout_id: int, user_id: int, data: dict) -> Optional[Workout]:
        try:
            workout = Workout.query.filter_by(id=workout_id, user_id=user_id).first()
            if not workout:
                return None

            if "name" in data:
                workout.name = data.get("name")
            if "notes" in data:
                workout.notes = data.get("notes")
            if data.get("finished") and workout.finished_at is None:
                workout.finished_at = datetime.utcnow()

            db.session.commit()
            return workout
        except SQLAlchemyError:
            db.session.rollback()
            logger.exception("Erro ao atualizar treino ID %s.", workout_id)
            return None

    def delete_workout(self, workout_id: int, user_id: int) -> bool:
        try:
            workout = Workout.query.filter_by(id=workout_id, user_id=user_id).first()
            if not workout:
                return False

            db.session.delete(workout)  # cascata apaga os SetLog associados
            db.session.commit()
            return True
        except SQLAlchemyError:
            db.session.rollback()
            logger.exception("Erro ao apagar treino ID %s.", workout_id)
            return False

    def add_set(self, workout_id: int, user_id: int, data: dict) -> Optional[SetLog]:
        workout = Workout.query.filter_by(id=workout_id, user_id=user_id).first()
        if not workout:
            return None

        exercise_id = data.get("exercise_id")
        existing_count = SetLog.query.filter_by(workout_id=workout_id, exercise_id=exercise_id).count()

        set_log = SetLog(
            workout_id=workout_id,
            exercise_id=exercise_id,
            set_number=existing_count + 1,
            weight_kg=data.get("weight_kg", 0),
            reps=data.get("reps", 0),
            rest_seconds=data.get("rest_seconds"),
        )
        db.session.add(set_log)
        db.session.commit()
        return set_log

    def _get_owned_set(self, workout_id: int, set_id: int, user_id: int) -> Optional[SetLog]:
        return (
            SetLog.query
            .join(Workout, SetLog.workout_id == Workout.id)
            .filter(SetLog.id == set_id, SetLog.workout_id == workout_id, Workout.user_id == user_id)
            .first()
        )

    def update_set(self, workout_id: int, set_id: int, user_id: int, data: dict) -> Optional[SetLog]:
        set_log = self._get_owned_set(workout_id, set_id, user_id)
        if not set_log:
            return None

        set_log.weight_kg = data.get("weight_kg", set_log.weight_kg)
        set_log.reps = data.get("reps", set_log.reps)
        if "rest_seconds" in data:
            set_log.rest_seconds = data.get("rest_seconds")

        db.session.commit()
        return set_log

    def delete_set(self, workout_id: int, set_id: int, user_id: int) -> bool:
        set_log = self._get_owned_set(workout_id, set_id, user_id)
        if not set_log:
            return False

        db.session.delete(set_log)
        db.session.commit()
        return True

    def get_exercise_history(self, exercise_id: int, user_id: int, limit: Optional[int] = None) -> list:
        """Histórico de séries de um exercício, agrupado por treino, mais recente primeiro.

        Usado pela referência "última vez" durante o registro ao vivo (limit=1).
        """
        workouts_query = (
            Workout.query
            .join(SetLog, SetLog.workout_id == Workout.id)
            .filter(Workout.user_id == user_id, SetLog.exercise_id == exercise_id)
            .order_by(Workout.started_at.desc())
            .distinct()
        )
        if limit:
            workouts_query = workouts_query.limit(limit)

        workouts = workouts_query.all()
        if not workouts:
            return []

        # Antes, cada treino do histórico disparava sua própria query de
        # séries dentro do loop — busca todas de uma vez e agrupa em Python.
        workout_ids = [w.id for w in workouts]
        all_sets = (
            SetLog.query
            .filter(SetLog.workout_id.in_(workout_ids), SetLog.exercise_id == exercise_id)
            .order_by(SetLog.set_number)
            .all()
        )
        sets_by_workout = {}
        for s in all_sets:
            sets_by_workout.setdefault(s.workout_id, []).append(s)

        history = []
        for workout in workouts:
            sets = sets_by_workout.get(workout.id, [])
            history.append({
                "workout_id": workout.id,
                "started_at": workout.started_at.isoformat(),
                "sets": [{"set_number": s.set_number, "weight_kg": s.weight_kg, "reps": s.reps} for s in sets],
            })
        return history

    def get_workout_progress(self, user_id: int, limit: int = 10) -> list:
        """Agrega tonelagem, reps e descanso médio dos últimos N treinos finalizados,
        para o usuário acompanhar evolução entre sessões.
        """
        workouts = (
            Workout.query
            .filter(Workout.user_id == user_id, Workout.finished_at.isnot(None))
            .order_by(Workout.started_at.desc())
            .limit(limit)
            .all()
        )
        if not workouts:
            return []

        # Antes, cada treino disparava sua própria query de séries dentro do
        # loop — busca todas de uma vez (para os `limit` treinos) e agrupa em
        # Python.
        workout_ids = [w.id for w in workouts]
        all_sets = SetLog.query.filter(SetLog.workout_id.in_(workout_ids)).all()
        sets_by_workout = {}
        for s in all_sets:
            sets_by_workout.setdefault(s.workout_id, []).append(s)

        progress = []
        for workout in workouts:
            sets = sets_by_workout.get(workout.id, [])
            total_tonnage = sum(s.weight_kg * s.reps for s in sets)
            total_reps = sum(s.reps for s in sets)
            rest_values = [s.rest_seconds for s in sets if s.rest_seconds is not None]
            avg_rest = sum(rest_values) / len(rest_values) if rest_values else None

            progress.append({
                "workout_id": workout.id,
                "name": workout.name,
                "started_at": workout.started_at.isoformat(),
                "total_tonnage": round(total_tonnage, 1),
                "total_reps": total_reps,
                "avg_rest_seconds": round(avg_rest, 1) if avg_rest is not None else None,
            })
        return progress
