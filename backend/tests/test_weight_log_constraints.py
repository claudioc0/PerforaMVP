"""Regressão: nada impedia dois registros de peso no mesmo dia.

Antes, WeightLog.date era nullable (sem nullable=False) e não existia
nenhuma constraint de unicidade — um usuário podia acumular quantos
registros quisesse no mesmo dia, e o gráfico (que agrupa por data)
mascarava a duplicata em vez de expô-la. Agora created_at é obrigatório e
uq_weight_logs_user_log_date barra um segundo registro no mesmo dia com um
IntegrityError real (não mockado).
"""
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import User, WeightLog


def _make_user(email):
    user = User(name="Teste Peso", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestUnicidadeDeWeightLogPorDia:
    def test_segundo_registro_no_mesmo_dia_levanta_integrity_error(self, app):
        with app.app_context():
            user = _make_user("weight-unique-a@example.com")
            today = datetime.utcnow()

            db.session.add(WeightLog(user_id=user.id, weight=80, created_at=today))
            db.session.commit()

            db.session.add(WeightLog(user_id=user.id, weight=81, created_at=today.replace(hour=23)))
            try:
                db.session.commit()
                assert False, "esperava IntegrityError por violar uq_weight_logs_user_log_date"
            except IntegrityError:
                db.session.rollback()

    def test_dias_diferentes_nao_colidem(self, app):
        with app.app_context():
            user = _make_user("weight-unique-b@example.com")
            today = datetime.utcnow()

            db.session.add(WeightLog(user_id=user.id, weight=80, created_at=today))
            db.session.add(WeightLog(user_id=user.id, weight=79, created_at=today - timedelta(days=1)))
            db.session.commit()

            assert WeightLog.query.filter_by(user_id=user.id).count() == 2

    def test_log_date_e_derivado_automaticamente_de_created_at(self, app):
        with app.app_context():
            user = _make_user("weight-unique-c@example.com")
            when = datetime(2026, 3, 15, 22, 30)

            log = WeightLog(user_id=user.id, weight=80, created_at=when)
            db.session.add(log)
            db.session.commit()

            assert log.log_date == when.date()


class TestRotaDeRegistroDePesoRecusaDuplicataNoMesmoDia:
    def test_segunda_chamada_no_mesmo_dia_devolve_409(self, client, auth_headers):
        first = client.post("/api/user/weight", json={"weight": 80}, headers=auth_headers)
        assert first.status_code == 201

        second = client.post("/api/user/weight", json={"weight": 81}, headers=auth_headers)
        assert second.status_code == 409
        assert "error" in second.get_json()
