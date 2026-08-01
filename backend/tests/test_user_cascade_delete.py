"""Regressão: apagar um usuário precisa apagar TUDO que depende dele.

Antes, só Meal e UserGoals tinham cascade="all, delete-orphan" no lado do
User. WaterLog, WeightLog, FavoriteMeal e Workout tinham a FK mas nenhuma
relationship (ou uma sem cascade) do lado do User — apagar um usuário com
qualquer um desses registros pendentes ou falhava com IntegrityError (o
SQLite tem PRAGMA foreign_keys=ON ligado neste app, então a violação de FK é
real) ou, num banco sem essa checagem, deixava linhas órfãs pra sempre.

Não mockamos nada aqui: cada tabela é populada de verdade e a exclusão do
User é a operação real do ORM (db.session.delete + commit) — se o cascade
não estiver configurado, este teste falha com um IntegrityError de verdade,
não com uma asserção manual.
"""
from datetime import date

from app.extensions import db
from app.models import (
    Exercise,
    FavoriteMeal,
    Meal,
    ProgressPhoto,
    SetLog,
    User,
    UserGoals,
    WaterLog,
    WeeklyPlan,
    WeeklyPlanDay,
    WeightLog,
    Workout,
    WorkoutSplit,
)


def _make_user(email):
    user = User(name="Teste Cascade", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestExclusaoDeUsuarioCascateiaParaTodosOsDependentes:
    def test_apagar_usuario_apaga_meals_water_weight_favoritos_treinos_e_plano(self, app):
        with app.app_context():
            user = _make_user("cascade-full@example.com")
            user_id = user.id

            db.session.add(Meal(
                user_id=user_id, description="Refeição", calories=1,
                protein_g=1, carbs_g=1, fat_g=1,
            ))
            db.session.add(UserGoals(user_id=user_id))
            db.session.add(WaterLog(user_id=user_id, amount_ml=200))
            db.session.add(WeightLog(user_id=user_id, weight=80))
            db.session.add(FavoriteMeal(
                user_id=user_id, description="Favorito", calories=1,
                protein_g=1, carbs_g=1, fat_g=1,
            ))
            db.session.add(ProgressPhoto(user_id=user_id, filename="cascade-teste.jpg", taken_at=date(2026, 1, 1)))

            split = WorkoutSplit(name="Push/Pull/Legs")
            db.session.add(split)
            db.session.commit()

            plan = WeeklyPlan(user_id=user_id, split_id=split.id)
            db.session.add(plan)
            db.session.commit()
            db.session.add(WeeklyPlanDay(plan_id=plan.id, day_of_week=0))

            workout = Workout(user_id=user_id, name="Treino")
            db.session.add(workout)
            db.session.commit()

            exercise = Exercise(name="Supino", normalized_name="supino-cascade-teste", muscle_group="peito")
            db.session.add(exercise)
            db.session.commit()

            db.session.add(SetLog(
                workout_id=workout.id, exercise_id=exercise.id,
                set_number=1, weight_kg=10, reps=10,
            ))
            db.session.commit()

            plan_id = plan.id
            workout_id = workout.id

            # Confere que tudo existe antes de apagar (a asserção final não
            # teria valor nenhum se essas linhas nunca tivessem existido).
            assert WaterLog.query.filter_by(user_id=user_id).count() == 1
            assert WeightLog.query.filter_by(user_id=user_id).count() == 1
            assert FavoriteMeal.query.filter_by(user_id=user_id).count() == 1
            assert ProgressPhoto.query.filter_by(user_id=user_id).count() == 1
            assert Workout.query.filter_by(user_id=user_id).count() == 1
            assert SetLog.query.filter_by(workout_id=workout_id).count() == 1
            assert WeeklyPlan.query.filter_by(user_id=user_id).count() == 1
            assert WeeklyPlanDay.query.filter_by(plan_id=plan_id).count() == 1

            # A própria exclusão não pode levantar IntegrityError — se o
            # cascade não estiver configurado, é aqui que o teste falha, com
            # o erro de FK real do SQLite (foreign_keys=ON já está ligado).
            db.session.delete(user)
            db.session.commit()

            assert Meal.query.filter_by(user_id=user_id).count() == 0
            assert UserGoals.query.filter_by(user_id=user_id).count() == 0
            assert WaterLog.query.filter_by(user_id=user_id).count() == 0
            assert WeightLog.query.filter_by(user_id=user_id).count() == 0
            assert FavoriteMeal.query.filter_by(user_id=user_id).count() == 0
            assert ProgressPhoto.query.filter_by(user_id=user_id).count() == 0
            assert Workout.query.filter_by(user_id=user_id).count() == 0
            assert SetLog.query.filter_by(workout_id=workout_id).count() == 0
            assert WeeklyPlan.query.filter_by(user_id=user_id).count() == 0
            assert WeeklyPlanDay.query.filter_by(plan_id=plan_id).count() == 0

            # O catálogo global (não pertence a um usuário) não deve ser afetado.
            assert WorkoutSplit.query.get(split.id) is not None
            assert Exercise.query.get(exercise.id) is not None
