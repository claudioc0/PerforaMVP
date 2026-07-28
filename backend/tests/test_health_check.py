"""Regressão: health check não tocava o banco.

Antes, /api/meals/health devolvia {"status": "ok"} sempre, sem executar
nenhuma query — uma queda total do banco (arquivo do SQLite corrompido,
Postgres fora do ar) ficava verde nesse endpoint enquanto qualquer rota de
verdade quebrava. Agora ele executa um SELECT 1 real contra o banco.
"""
from app.extensions import db


class TestHealthCheckTocaOBanco:
    def test_com_banco_saudavel_devolve_200_ok(self, client):
        response = client.get("/api/meals/health")
        assert response.status_code == 200
        assert response.get_json()["status"] == "ok"

    def test_com_banco_fora_do_ar_devolve_503(self, client, monkeypatch):
        def _falha(*args, **kwargs):
            raise Exception("banco de dados inacessível (simulado)")

        monkeypatch.setattr(db.session, "execute", _falha)

        response = client.get("/api/meals/health")
        assert response.status_code == 503
        assert response.get_json()["status"] == "error"
