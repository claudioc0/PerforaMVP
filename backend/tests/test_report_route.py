"""Feature: GET /api/user/report — aceita JWT via header OU via query string
(?jwt=...), diferente de toda outra rota do app. Necessário porque o app
abre esse download com Linking.openURL (navegador do sistema), que não
manda o header Authorization.
"""


class TestExportReport:
    def test_pdf_via_header_devolve_content_type_correto(self, auth_client):
        response = auth_client.get("/api/user/report?format=pdf")

        assert response.status_code == 200
        assert response.content_type == "application/pdf"
        assert "attachment" in response.headers["Content-Disposition"]
        assert response.data.startswith(b"%PDF")

    def test_csv_via_header_devolve_content_type_correto(self, auth_client):
        response = auth_client.get("/api/user/report?format=csv")

        assert response.status_code == 200
        assert response.content_type.startswith("text/csv")
        assert b"Resumo Semanal" in response.data

    def test_formato_invalido_devolve_400(self, auth_client):
        response = auth_client.get("/api/user/report?format=xml")

        assert response.status_code == 400

    def test_sem_formato_usa_pdf_como_padrao(self, auth_client):
        response = auth_client.get("/api/user/report")

        assert response.status_code == 200
        assert response.content_type == "application/pdf"

    def test_token_via_query_string_funciona(self, client, auth_headers):
        token = auth_headers["Authorization"].split(" ", 1)[1]

        response = client.get(f"/api/user/report?format=csv&jwt={token}")

        assert response.status_code == 200

    def test_sem_token_nenhum_devolve_401(self, client):
        response = client.get("/api/user/report?format=csv")

        assert response.status_code == 401

    def test_token_via_query_string_nao_funciona_em_outras_rotas(self, client, auth_headers):
        """Prova que o location extra é só desta rota — não uma mudança na
        config global do app que afrouxaria a autenticação em todo lugar."""
        token = auth_headers["Authorization"].split(" ", 1)[1]

        response = client.get(f"/api/user/goals?jwt={token}")

        assert response.status_code == 401
