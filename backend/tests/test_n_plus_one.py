"""Regressão: nenhuma dessas consultas pode crescer com o tamanho dos dados.

Antes, resolver o nome/grupo muscular de um exercício (ou os dias de uma
divisão, ou as séries de um treino) disparava uma query POR ITEM dentro de um
loop — um treino de 40 séries virava 41 queries. A prova aqui não é "poucas
queries" (um número mágico que pode mudar), e sim que o número de queries NÃO
CRESCE quando o volume de dados cresce: comparamos uma amostra pequena com uma
maior e travamos que a contagem de queries seja igual nas duas (número
constante), nunca proporcional ao N de itens.

Cuidado ao ler os testes: toda vez que um objeto é acessado (ex: `obj.id`)
pela primeira vez depois de um commit, o SQLAlchemy (expire_on_commit=True,
padrão do Flask-SQLAlchemy) dispara uma query de "refresh" pra recarregar os
atributos expirados — isso não tem nada a ver com N+1, mas contaminaria a
contagem se acontecesse DENTRO do bloco medido. Por isso todo `.id` usado nos
blocos medidos é lido em uma variável ANTES de entrar no `count_queries()`.
"""
from contextlib import contextmanager

from sqlalchemy import event

from app.extensions import db
from app.models import Exercise, SetLog, SplitDay, SplitDayExercise, User, Workout, WorkoutSplit
from app.services.split_service import SplitService
from app.services.workout_service import WorkoutService


@contextmanager
def count_queries():
    counter = {"n": 0}

    def _inc(*args, **kwargs):
        counter["n"] += 1

    event.listen(db.engine, "before_cursor_execute", _inc)
    try:
        yield counter
    finally:
        event.remove(db.engine, "before_cursor_execute", _inc)


def _make_user(email):
    user = User(name="N+1 Test", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user.id


def _make_exercises(n, prefix):
    exercises = []
    for i in range(n):
        ex = Exercise(
            name=f"{prefix} {i}",
            normalized_name=f"{prefix.lower()} {i}",
            muscle_group="core",
        )
        db.session.add(ex)
        exercises.append(ex)
    db.session.commit()
    return [e.id for e in exercises]


def _make_workout_with_sets(user_id, num_sets, exercise_ids):
    workout = Workout(user_id=user_id, name="Treino teste")
    db.session.add(workout)
    db.session.commit()
    workout_id = workout.id
    for i in range(num_sets):
        exercise_id = exercise_ids[i % len(exercise_ids)]
        db.session.add(SetLog(
            workout_id=workout_id, exercise_id=exercise_id,
            set_number=i + 1, weight_kg=10, reps=10,
        ))
    db.session.commit()
    return workout_id


class TestGetWorkoutDetailNaoEscalaComNumeroDeSeries:
    def test_numero_de_queries_nao_cresce_com_mais_series(self, app):
        with app.app_context():
            user_id = _make_user("n1a@example.com")
            exercise_ids = _make_exercises(3, "Ex")
            small_workout_id = _make_workout_with_sets(user_id, 2, exercise_ids)
            big_workout_id = _make_workout_with_sets(user_id, 20, exercise_ids)

            service = WorkoutService()
            service.get_workout_detail(small_workout_id, user_id)  # aquecimento (ver docstring)

            with count_queries() as small_count:
                service.get_workout_detail(small_workout_id, user_id)

            with count_queries() as big_count:
                service.get_workout_detail(big_workout_id, user_id)

            assert big_count["n"] == small_count["n"], (
                f"get_workout_detail disparou {small_count['n']} queries para 2 "
                f"séries e {big_count['n']} para 20 séries — o número de "
                "queries não pode crescer com a quantidade de séries."
            )


class TestGetExerciseHistoryNaoEscalaComNumeroDeTreinos:
    def test_numero_de_queries_nao_cresce_com_mais_treinos(self, app):
        with app.app_context():
            user_id = _make_user("n1b@example.com")
            exercise_ids = _make_exercises(1, "Supino")
            exercise_id = exercise_ids[0]

            for _ in range(2):
                _make_workout_with_sets(user_id, 1, exercise_ids)
            service = WorkoutService()
            service.get_exercise_history(exercise_id, user_id)  # aquecimento (ver docstring)

            with count_queries() as small_count:
                service.get_exercise_history(exercise_id, user_id)

            for _ in range(10):
                _make_workout_with_sets(user_id, 1, exercise_ids)
            with count_queries() as big_count:
                service.get_exercise_history(exercise_id, user_id)

            assert big_count["n"] == small_count["n"], (
                f"get_exercise_history disparou {small_count['n']} queries com "
                f"2 treinos e {big_count['n']} com 12 treinos — não pode "
                "crescer com o número de treinos no histórico."
            )


class TestGetWorkoutProgressNaoEscalaComNumeroDeTreinos:
    def test_numero_de_queries_nao_cresce_com_mais_treinos(self, app):
        with app.app_context():
            user_id = _make_user("n1c@example.com")
            exercise_ids = _make_exercises(2, "Agachamento")
            service = WorkoutService()

            w1_id = _make_workout_with_sets(user_id, 3, exercise_ids)
            workout = db.session.get(Workout, w1_id)
            workout.finished_at = workout.started_at
            db.session.commit()

            service.get_workout_progress(user_id, limit=10)  # aquecimento (ver docstring)

            with count_queries() as small_count:
                service.get_workout_progress(user_id, limit=10)

            for _ in range(8):
                w_id = _make_workout_with_sets(user_id, 3, exercise_ids)
                w = db.session.get(Workout, w_id)
                w.finished_at = w.started_at
            db.session.commit()

            with count_queries() as big_count:
                service.get_workout_progress(user_id, limit=10)

            assert big_count["n"] == small_count["n"], (
                f"get_workout_progress disparou {small_count['n']} queries com "
                f"1 treino e {big_count['n']} com 9 treinos — não pode crescer "
                "com o número de treinos."
            )


class TestListSplitsNaoEscalaComNumeroDeDivisoes:
    def test_numero_de_queries_nao_cresce_com_mais_divisoes(self, app):
        with app.app_context():
            service = SplitService()

            split1 = WorkoutSplit(name="Full Body")
            db.session.add(split1)
            db.session.commit()
            split1_id = split1.id
            db.session.add(SplitDay(split_id=split1_id, name="Dia único", order=0))
            db.session.commit()

            service.list_splits()  # aquecimento (ver docstring)

            with count_queries() as small_count:
                service.list_splits()

            for i in range(6):
                split = WorkoutSplit(name=f"Split {i}")
                db.session.add(split)
                db.session.commit()
                split_id = split.id
                db.session.add(SplitDay(split_id=split_id, name="Dia A", order=0))
                db.session.add(SplitDay(split_id=split_id, name="Dia B", order=1))
            db.session.commit()

            with count_queries() as big_count:
                service.list_splits()

            assert big_count["n"] == small_count["n"], (
                f"list_splits disparou {small_count['n']} queries com 1 divisão "
                f"e {big_count['n']} com 7 divisões — não pode crescer com o "
                "número de divisões."
            )


class TestGetDayExercisesNaoEscalaComNumeroDeExercicios:
    def test_numero_de_queries_nao_cresce_com_mais_exercicios_sugeridos(self, app):
        with app.app_context():
            service = SplitService()
            split = WorkoutSplit(name="PPL")
            db.session.add(split)
            db.session.commit()
            split_id = split.id

            small_day = SplitDay(split_id=split_id, name="Push pequeno", order=0)
            big_day = SplitDay(split_id=split_id, name="Push grande", order=1)
            db.session.add_all([small_day, big_day])
            db.session.commit()
            small_day_id = small_day.id
            big_day_id = big_day.id

            exercise_ids = _make_exercises(8, "Peito")

            for i, exercise_id in enumerate(exercise_ids[:2]):
                db.session.add(SplitDayExercise(split_day_id=small_day_id, exercise_id=exercise_id, order=i))
            for i, exercise_id in enumerate(exercise_ids):
                db.session.add(SplitDayExercise(split_day_id=big_day_id, exercise_id=exercise_id, order=i))
            db.session.commit()

            service.get_day_exercises(small_day_id)  # aquecimento (ver docstring)

            with count_queries() as small_count:
                service.get_day_exercises(small_day_id)

            with count_queries() as big_count:
                service.get_day_exercises(big_day_id)

            assert big_count["n"] == small_count["n"], (
                f"get_day_exercises disparou {small_count['n']} queries com 2 "
                f"exercícios e {big_count['n']} com 8 — não pode crescer com o "
                "número de exercícios sugeridos."
            )
