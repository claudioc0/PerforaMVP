"""Regressão: a rota /meals/analyze-label precisa aceitar upload de imagem,
validar extensão/presença do arquivo, e mapear os mesmos tipos de erro da IA
pro status HTTP certo — mesmo padrão de test_analyze_route_error_status.py
pra /meals/analyze.
"""
from io import BytesIO

from app.services.gemini_service import GeminiAnalysisError, GeminiRateLimitError, GeminiTimeoutError


def _register_and_login(client, email):
    credentials = {"name": "Teste Rótulo", "email": email, "password": "SenhaForte1"}
    resp = client.post("/api/auth/register", json=credentials)
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"email": email, "password": credentials["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['token']}"}


def _post_image(client, headers, filename="rotulo.jpg"):
    return client.post(
        "/api/meals/analyze-label",
        data={"image": (BytesIO(b"fake-image-bytes"), filename)},
        content_type="multipart/form-data",
        headers=headers,
    )


class TestAnalyzeLabelRoute:
    def test_sem_campo_image_devolve_400(self, client):
        headers = _register_and_login(client, "label-sem-imagem@example.com")
        response = client.post("/api/meals/analyze-label", json={}, headers=headers)
        assert response.status_code == 400

    def test_extensao_nao_suportada_devolve_400(self, client):
        headers = _register_and_login(client, "label-ext-invalida@example.com")
        response = _post_image(client, headers, filename="rotulo.exe")
        assert response.status_code == 400

    def test_sucesso_devolve_produto_no_shape_achatado(self, client, monkeypatch):
        headers = _register_and_login(client, "label-sucesso@example.com")
        from app.services.meal_service import MealService

        def _fake_analyze_label(self, image_bytes):
            return {
                "description": "Barra de Proteína",
                "calories": 200.0,
                "protein_g": 20.0,
                "carbs_g": 15.0,
                "fat_g": 6.0,
            }

        monkeypatch.setattr(MealService, "analyze_label", _fake_analyze_label)

        response = _post_image(client, headers)
        assert response.status_code == 200
        body = response.get_json()
        assert body == {
            "description": "Barra de Proteína",
            "calories": 200.0,
            "protein_g": 20.0,
            "carbs_g": 15.0,
            "fat_g": 6.0,
        }

    def test_rate_limit_devolve_429(self, client, monkeypatch):
        headers = _register_and_login(client, "label-429@example.com")
        from app.services.meal_service import MealService

        def _raise(self, image_bytes):
            raise GeminiRateLimitError("Limite de uso da IA atingido no momento.")

        monkeypatch.setattr(MealService, "analyze_label", _raise)

        response = _post_image(client, headers)
        assert response.status_code == 429

    def test_timeout_devolve_504(self, client, monkeypatch):
        headers = _register_and_login(client, "label-504@example.com")
        from app.services.meal_service import MealService

        def _raise(self, image_bytes):
            raise GeminiTimeoutError("A IA demorou demais para responder.")

        monkeypatch.setattr(MealService, "analyze_label", _raise)

        response = _post_image(client, headers)
        assert response.status_code == 504

    def test_erro_generico_de_analise_devolve_422(self, client, monkeypatch):
        headers = _register_and_login(client, "label-422@example.com")
        from app.services.meal_service import MealService

        def _raise(self, image_bytes):
            raise GeminiAnalysisError("Erro ao formatar os dados retornados pela IA.")

        monkeypatch.setattr(MealService, "analyze_label", _raise)

        response = _post_image(client, headers)
        assert response.status_code == 422
