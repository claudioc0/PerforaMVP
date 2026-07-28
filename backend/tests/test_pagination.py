"""Regressão: nenhuma listagem pode devolver a tabela inteira sempre.

Antes, histórico de peso, treinos e favoritos voltavam inteiros numa
resposta só, sempre — sem paginação nenhuma. Com anos de uso isso vira
centenas de linhas por resposta. Os três endpoints agora aceitam
`page`/`per_page` e devolvem um envelope `{items, page, per_page, total,
has_more}` em vez de um array solto, com um teto máximo (100) que nenhum
valor de `per_page` consegue ultrapassar.
"""
from datetime import datetime, timedelta

from app.extensions import db
from app.models import FavoriteMeal, Workout, WeightLog
from app.utils.pagination import MAX_PER_PAGE


def _add_weight_logs(user_id, count):
    base = datetime.utcnow() - timedelta(days=count)
    for i in range(count):
        db.session.add(WeightLog(user_id=user_id, weight=70 + i, date=base + timedelta(days=i)))
    db.session.commit()


def _add_workouts(user_id, count):
    base = datetime.utcnow() - timedelta(days=count)
    for i in range(count):
        db.session.add(Workout(user_id=user_id, name=f"Treino {i}", started_at=base + timedelta(days=i)))
    db.session.commit()


def _add_favorites(user_id, count):
    for i in range(count):
        db.session.add(FavoriteMeal(
            user_id=user_id, description=f"Favorito {i}",
            calories=100, protein_g=10, carbs_g=10, fat_g=5,
        ))
    db.session.commit()


def _user_id_from_auth_headers(app, auth_headers):
    from flask_jwt_extended import decode_token
    token = auth_headers["Authorization"].split(" ")[1]
    with app.app_context():
        return int(decode_token(token)["sub"])


class TestPaginacaoDoHistoricoDePeso:
    def test_envelope_com_metadados_e_teto_maximo(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_weight_logs(user_id, MAX_PER_PAGE + 20)

        response = client.get("/api/user/weight?per_page=99999", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == MAX_PER_PAGE
        assert body["per_page"] == MAX_PER_PAGE
        assert body["total"] == MAX_PER_PAGE + 20
        assert body["has_more"] is True

    def test_mantem_ordem_cronologica_mais_antiga_para_mais_nova(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_weight_logs(user_id, 5)

        response = client.get("/api/user/weight", headers=auth_headers)
        items = response.get_json()["items"]

        dates = [item["date"] for item in items]
        assert dates == sorted(dates), "histórico de peso deve continuar ordenado do mais antigo pro mais novo"


class TestPaginacaoDeTreinos:
    def test_envelope_com_metadados(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_workouts(user_id, 15)

        response = client.get("/api/workouts?per_page=10", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == 10
        assert body["total"] == 15
        assert body["has_more"] is True

    def test_segunda_pagina_traz_o_restante(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_workouts(user_id, 15)

        page2 = client.get("/api/workouts?per_page=10&page=2", headers=auth_headers).get_json()
        assert len(page2["items"]) == 5
        assert page2["has_more"] is False


class TestPaginacaoDeFavoritos:
    def test_envelope_com_metadados_e_teto_maximo(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_favorites(user_id, MAX_PER_PAGE + 10)

        response = client.get("/api/meals/favorites?per_page=99999", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == MAX_PER_PAGE
        assert body["total"] == MAX_PER_PAGE + 10

    def test_favorito_de_outro_usuario_nao_aparece(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_favorites(user_id, 2)
            from app.models import User
            other = User(name="Outro", email="outro-fav@example.com")
            other.set_password("SenhaForte1")
            db.session.add(other)
            db.session.commit()
            _add_favorites(other.id, 3)

        response = client.get("/api/meals/favorites", headers=auth_headers)
        assert response.get_json()["total"] == 2


class TestPaginaEPerPageForaDoIntervaloSaoTratadosComSeguranca:
    def test_page_zero_ou_negativa_vira_pagina_1(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_workouts(user_id, 3)

        response = client.get("/api/workouts?page=0", headers=auth_headers)
        assert response.get_json()["page"] == 1

        response = client.get("/api/workouts?page=-5", headers=auth_headers)
        assert response.get_json()["page"] == 1

    def test_per_page_zero_ou_negativo_nao_quebra(self, app, client, auth_headers):
        user_id = _user_id_from_auth_headers(app, auth_headers)
        with app.app_context():
            _add_workouts(user_id, 3)

        response = client.get("/api/workouts?per_page=0", headers=auth_headers)
        assert response.status_code == 200
        assert response.get_json()["per_page"] >= 1
