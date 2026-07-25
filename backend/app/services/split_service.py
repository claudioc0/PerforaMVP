from app.models import WorkoutSplit, SplitDay, SplitDayExercise, Exercise


class SplitService:
    """Camada de serviço para as divisões de treino pré-cadastradas (Bro Split,
    ABCD, PPL, Upper/Lower, Full Body) e seus dias/exercícios sugeridos.
    """

    def list_splits(self) -> list:
        """Todas as divisões com seus dias aninhados (sem os exercícios ainda —
        carga leve pra tela de escolha)."""
        splits = WorkoutSplit.query.order_by(WorkoutSplit.id).all()
        result = []
        for split in splits:
            split_dict = split.to_dict()
            days = SplitDay.query.filter_by(split_id=split.id).order_by(SplitDay.order).all()
            split_dict["days"] = [day.to_dict() for day in days]
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

        result = []
        for day_exercise in day_exercises:
            exercise = Exercise.query.get(day_exercise.exercise_id)
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
