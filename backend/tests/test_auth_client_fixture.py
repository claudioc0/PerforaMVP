"""Regressão: escrever um teste de rota nova não pode exigir repetir o
boilerplate de login (registrar, logar, montar o header Authorization) toda
vez — a fixture `auth_client` encapsula isso.
"""


class TestAuthClientInjetaOHeaderAutomaticamente:
    def test_get_numa_rota_protegida_funciona_sem_passar_headers(self, auth_client):
        response = auth_client.get("/api/user/goals")
        assert response.status_code == 200

    def test_post_numa_rota_protegida_funciona_sem_passar_headers(self, auth_client):
        response = auth_client.post("/api/user/water/add", json={"amount": 200})
        assert response.status_code == 200

    def test_sem_auth_client_a_mesma_rota_exige_o_header_manual(self, client):
        """Prova que o header realmente vem do auth_client, não de alguma
        configuração global — sem ele, a mesma rota nega acesso."""
        response = client.get("/api/user/goals")
        assert response.status_code == 401


class TestAuthClientPermiteSobrescreverHeadersPorChamada:
    def test_header_explicito_tem_prioridade_sobre_o_token_padrao(self, auth_client):
        """Um teste que precisa simular um token inválido de propósito ainda
        consegue — o header passado na chamada vence o padrão da fixture."""
        response = auth_client.get(
            "/api/user/goals", headers={"Authorization": "Bearer token-invalido"}
        )
        assert response.status_code == 401
