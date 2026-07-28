"""Regressão: nenhuma rota pode devolver HTML de erro nem deixar a sessão
suja pra requisição seguinte.

Antes desta correção:
- Rotas sem NENHUM try/except (a maioria de workouts_routes.py, várias de
  user_routes.py) deixavam uma exceção não tratada virar a página HTML de
  erro 500 do Flask/Werkzeug — um client que só sabe interpretar JSON
  recebia HTML.
- Vários commit()s (favoritos em meals_routes.py, criar/editar treino e
  série em workout_service.py, metas/água em user_service.py) não tinham
  nenhum rollback() no caminho de erro — uma falha deixava a sessão numa
  transação pendente/inválida.
- float(data.get("weight", 0)) em log_weight quebrava sem tratamento nenhum
  se "weight" viesse como string não-numérica.

O teste mais importante deste arquivo (TestSessaoNaoFicaSujaEntreRequests)
prova a consequência prática de tudo isso: depois de uma falha simulada
numa requisição, a PRÓXIMA requisição (no mesmo processo/app) continua
funcionando normalmente.
"""
import logging

from app.extensions import db


class TestHandlerGlobalDevolveJson:
    def test_rota_inexistente_devolve_404_em_json_nao_html(self, client):
        response = client.get("/api/rota-que-nao-existe")
        assert response.status_code == 404
        assert response.content_type.startswith("application/json")
        assert "error" in response.get_json()

    def test_metodo_nao_permitido_devolve_405_em_json(self, client):
        response = client.delete("/api/meals/health")
        assert response.status_code == 405
        assert response.content_type.startswith("application/json")

    def test_excecao_nao_tratada_devolve_500_em_json_nao_html(self, app, client, auth_headers, monkeypatch):
        from app.services import UserService

        def _raise(*args, **kwargs):
            raise RuntimeError("falha simulada de propósito")

        monkeypatch.setattr(UserService, "get_user_goals", _raise)

        response = client.get("/api/user/goals", headers=auth_headers)
        assert response.status_code == 500
        assert response.content_type.startswith("application/json")
        assert "error" in response.get_json()

    def test_excecao_nao_tratada_e_logada_nao_engolida_silenciosamente(
        self, app, client, auth_headers, monkeypatch, caplog
    ):
        from app.services import UserService

        def _raise(*args, **kwargs):
            raise RuntimeError("falha simulada de propósito")

        monkeypatch.setattr(UserService, "get_user_goals", _raise)

        with caplog.at_level(logging.ERROR):
            client.get("/api/user/goals", headers=auth_headers)

        assert any(r.levelno >= logging.ERROR for r in caplog.records), (
            "uma exceção não tratada precisa deixar rastro no log — "
            "antes virava um 500 às cegas, sem nenhum registro."
        )


class TestSessaoNaoFicaSujaEntreRequests:
    """A prova mais direta do problema: depois de uma falha de commit
    simulada (sem rollback próprio, propagando pro handler global), a
    PRÓXIMA requisição no mesmo app precisa continuar funcionando —
    provando que a sessão não ficou numa transação pendente/inválida."""

    def test_depois_de_uma_falha_de_commit_a_proxima_requisicao_funciona(
        self, app, client, auth_headers, monkeypatch
    ):
        from app.services import WorkoutService

        original_commit = db.session.commit
        calls = {"n": 0}

        def _fail_once(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("falha de commit simulada")
            return original_commit(*args, **kwargs)

        monkeypatch.setattr(db.session, "commit", _fail_once)

        # Primeira requisição: commit falha, propaga pro handler global.
        first = client.post("/api/workouts", json={"name": "Treino A"}, headers=auth_headers)
        assert first.status_code == 500

        # Restaura o commit real pra próxima requisição (o monkeypatch já
        # devolveria o real na segunda chamada de qualquer forma, mas
        # deixamos explícito: o que importa é que a SESSÃO em si — não o
        # mock — está limpa o suficiente pra aceitar uma escrita nova).
        second = client.post("/api/workouts", json={"name": "Treino B"}, headers=auth_headers)
        assert second.status_code == 201
        assert second.get_json()["name"] == "Treino B"

    def test_favorito_com_erro_de_commit_nao_impede_o_proximo_favorito(
        self, app, client, auth_headers, monkeypatch
    ):
        original_commit = db.session.commit
        calls = {"n": 0}

        def _fail_once(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("falha de commit simulada")
            return original_commit(*args, **kwargs)

        monkeypatch.setattr(db.session, "commit", _fail_once)

        payload = {"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3}
        first = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert first.status_code == 500

        second = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert second.status_code == 201


class TestPesoInvalidoNaoDerrubaARota:
    def test_peso_nao_numerico_devolve_400_nao_500(self, client, auth_headers):
        response = client.post("/api/user/weight", json={"weight": "abc"}, headers=auth_headers)
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_peso_nulo_devolve_400(self, client, auth_headers):
        response = client.post("/api/user/weight", json={"weight": None}, headers=auth_headers)
        assert response.status_code == 400

    def test_peso_valido_continua_funcionando(self, client, auth_headers):
        response = client.post("/api/user/weight", json={"weight": 82.5}, headers=auth_headers)
        assert response.status_code == 201


class TestCalcularMetasComDadosIncompletos:
    def test_dados_incompletos_devolve_400_nao_500(self, client, auth_headers):
        response = client.post(
            "/api/user/calculate-goals", json={"weight": 80}, headers=auth_headers
        )
        assert response.status_code == 400
        assert "error" in response.get_json()


class TestFavoritoComValoresInvalidos:
    def test_calorias_nao_numericas_devolve_400_nao_500(self, client, auth_headers):
        response = client.post(
            "/api/meals/favorites",
            json={"description": "Arroz", "calories": "muitas"},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestAddWaterLogaFalhaEmVezDeEngolir(object):
    def test_falha_no_service_e_logada_e_devolve_500(self, client, auth_headers, monkeypatch, caplog):
        from app.services import UserService

        def _raise(*args, **kwargs):
            raise RuntimeError("falha simulada no add_water_intake")

        monkeypatch.setattr(UserService, "add_water_intake", _raise)

        with caplog.at_level(logging.ERROR):
            response = client.post("/api/user/water/add", json={"amount": 300}, headers=auth_headers)

        assert response.status_code == 500
        assert any(r.levelno >= logging.ERROR for r in caplog.records)
