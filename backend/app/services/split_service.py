from app.models import WorkoutSplit, SplitDay, SplitDayExercise, Exercise


class SplitService:
    """Camada de serviço para as divisões de treino pré-cadastradas (Bro Split,
    ABCD, PPL, Upper/Lower, Full Body) e seus dias/exercícios sugeridos.
    """

    def list_splits(self) -> list:
        """Todas as divisões com seus dias aninhados (sem os exercícios ainda —
        carga leve pra tela de escolha)."""
        splits = WorkoutSplit.query.order_by(WorkoutSplit.id).all()
        if not splits:
            return []

        # Antes, cada divisão disparava sua própria query de dias dentro do
        # loop — busca todos de uma vez e agrupa em Python.
        split_ids = [s.id for s in splits]
        all_days = (
            SplitDay.query
            .filter(SplitDay.split_id.in_(split_ids))
            .order_by(SplitDay.order)
            .all()
        )
        days_by_split = {}
        for day in all_days:
            days_by_split.setdefault(day.split_id, []).append(day)

        result = []
        for split in splits:
            split_dict = split.to_dict()
            split_dict["days"] = [day.to_dict() for day in days_by_split.get(split.id, [])]
            result.append(split_dict)
        return result

    def get_day_exercises(self, split_day_id: int) -> list:
        """Exercícios sugeridos de um dia, ordenados, com nome/grupo muscular resolvidos."""
        day_exercises = (
            SplitDayExercise.query
            .filter_by(split_day_id=split_day_id)
            .order_by(SplitDayExercise.order)
            .all()
        )
        if not day_exercises:
            return []

        # Antes, cada exercício sugerido disparava sua própria query pra
        # resolver nome/grupo muscular — busca todos de uma vez.
        exercise_ids = [de.exercise_id for de in day_exercises]
        exercises_by_id = {e.id: e for e in Exercise.query.filter(Exercise.id.in_(exercise_ids)).all()}

        result = []
        for day_exercise in day_exercises:
            exercise = exercises_by_id.get(day_exercise.exercise_id)
            if not exercise:
                continue
            result.append({
                "exercise_id": exercise.id,
                "name": exercise.name,
                "muscle_group": exercise.muscle_group,
                "equipment": exercise.equipment,
                "order": day_exercise.order,
            })
        return result
