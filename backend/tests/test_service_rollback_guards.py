"""Regressão: cada service com escrita no banco precisa fazer rollback
próprio quando o commit falha — não pode depender só do handler global de
erro da aplicação (que existe como rede de segurança, não como a única
linha de defesa).

Onde o método tem um caminho realista pra uma falha de verdade através da
sua PRÓPRIA escrita (ex: uma FK inválida que o próprio chamador poderia
passar), o teste aciona essa falha de verdade — mockar `db.session.commit`
inteiro não serve aqui: isso nunca chega a acionar o mecanismo real do
SQLAlchemy que marca a transação como inválida após uma falha de flush, e a
sessão pareceria "limpa" mesmo sem nenhum rollback próprio.

Onde a escrita do método não tem NENHUM valor de entrada que viole uma
constraint real (ex: só grava float/int sem FK/unique), uma falha de commit
só aconteceria por infraestrutura (conexão caiu, disco cheio) — impossível
de simular de forma realista num teste unitário. Nesses casos, o teste
verifica a ESTRUTURA do código (try/except em volta do commit, com
rollback no except) em vez de acionar dinamicamente.
"""
import inspect

import pytest
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Exercise, SetLog, User, Workout
from app.services import UserService, WorkoutService
from app.services.user_service import UserService as UserServiceClass
from app.services.workout_service import WorkoutService as WorkoutServiceClass
from app.routes import meals_routes


def _assert_session_still_usable(marker: str):
    """Depois de uma falha real, a sessão precisa aceitar uma escrita nova
    sem levantar erro nenhum — prova de que não ficou numa transação
    pendente/inválida (PendingRollbackError)."""
    probe = User(name="Prova", email=f"prova-{marker}@example.com")
    probe.set_password("SenhaForte1")
    db.session.add(probe)
    db.session.commit()
    assert User.query.filter_by(email=probe.email).first() is not None


def _assert_has_guarded_commit(method) -> None:
    """Trava estrutural: o método precisa ter um try/except em volta do
    commit(), com rollback() no except — usado onde não dá pra acionar uma
    falha real de forma realista através da própria escrita do método."""
    source = inspect.getsource(method)
    assert "db.session.commit()" in source
    assert "except" in source
    assert "db.session.rollback()" in source


class TestWorkoutServiceFazRollbackProprio:
    def _make_user(self, email="teste-workout@example.com"):
        user = User(name="Teste", email=email)
        user.set_password("SenhaForte1")
        db.session.add(user)
        db.session.commit()
        return user

    def test_create_workout_com_fk_invalida_devolve_none_e_limpa_a_sessao(self, app):
        with app.app_context():
            service = WorkoutService()

            # user_id inexistente viola a FK de verdade (foreign_keys=ON já
            # está ligado nas conexões SQLite deste app) — dispara um
            # IntegrityError real no commit(), não simulado.
            result = service.create_workout(999999, {"name": "Treino"})

            assert result is None
            _assert_session_still_usable("create-workout")

    def test_add_set_com_exercise_id_invalido_devolve_none_e_limpa_a_sessao(self, app):
        with app.app_context():
            user = self._make_user()
            workout = Workout(user_id=user.id, name="Treino")
            db.session.add(workout)
            db.session.commit()

            service = WorkoutService()
            # exercise_id inexistente — mesmo princípio: FK real, dado que
            # o próprio chamador (a rota) controla.
            result = service.add_set(workout.id, user.id, {"exercise_id": 999999})

            assert result is None
            _assert_session_still_usable("add-set")

    def test_update_set_tem_commit_protegido_por_try_except_com_rollback(self):
        """update_set só grava weight_kg/reps/rest_seconds (sem FK/unique
        que um valor de entrada normal possa violar) — uma falha de commit
        aqui só viria de infraestrutura, impossível de simular de forma
        realista. Trava a estrutura do código em vez disso."""
        _assert_has_guarded_commit(WorkoutServiceClass.update_set)

    def test_delete_set_tem_commit_protegido_por_try_except_com_rollback(self):
        """Uma DELETE de uma única linha sem nada referenciando-a via
        RESTRICT não tem como falhar por constraint — mesma lógica do
        update_set acima."""
        _assert_has_guarded_commit(WorkoutServiceClass.delete_set)


class TestUserServiceFazRollbackProprio:
    def _make_user(self, email="teste-user-service@example.com"):
        user = User(name="Teste", email=email)
        user.set_password("SenhaForte1")
        db.session.add(user)
        db.session.commit()
        return user

    def test_add_water_intake_com_user_id_invalido_relanca_e_limpa_a_sessao(self, app):
        with app.app_context():
            service = UserService()

            with pytest.raises(IntegrityError):
                # user_id inexistente — FK real em water_logs.user_id,
                # através da própria escrita do método.
                service.add_water_intake(999999, 300)

            _assert_session_still_usable("add-water")

    def test_update_user_goals_tem_commit_protegido_por_try_except_com_rollback(self):
        """update_user_goals só grava campos de UserGoals sem FK/unique que
        um valor normal possa violar (o user_id já foi validado antes) —
        mesma lógica de update_set: sem caminho realista pra uma falha de
        constraint através da própria escrita. Trava a estrutura."""
        _assert_has_guarded_commit(UserServiceClass.update_user_goals)


class TestFavoritosTemCommitProtegido:
    """add_favorite/remove_favorite (meals_routes.py) escrevem user_id a
    partir da identidade JWT já autenticada — não dá pra injetar uma FK
    inválida através da rota HTTP pra forçar uma falha real (o que tornaria
    o teste mais um "será que existe alguma rota de erro" do que um teste
    específico deste ponto). Trava a estrutura do código em vez disso."""

    def test_add_favorite_tem_commit_protegido_por_try_except_com_rollback(self):
        _assert_has_guarded_commit(meals_routes.add_favorite)

    def test_remove_favorite_tem_commit_protegido_por_try_except_com_rollback(self):
        _assert_has_guarded_commit(meals_routes.remove_favorite)
