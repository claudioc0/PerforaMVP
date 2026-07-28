"""Regressão: a rota /meals/analyze precisa devolver o status HTTP certo por
tipo de falha da IA — não sempre 422.

Antes, qualquer falha (timeout, 429, resposta malformada) virava 422, porque
gemini_service.py só levantava um GeminiAnalysisError genérico pra tudo. O
frontend também só sabia detectar rate limit adivinhando "429" dentro do
texto da mensagem — agora ele lê `error.status` de verdade.
"""
from app.services.gemini_service import GeminiRateLimitError, GeminiTimeoutError


def _register_and_login(client, email):
    credentials = {"name": "Teste Status", "email": email, "password": "SenhaForte1"}
    resp = client.post("/api/auth/register", json=credentials)
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"email": email, "password": credentials["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['token']}"}


class TestStatusHttpPorTipoDeFalha:
    def test_rate_limit_devolve_429(self, client, monkeypatch):
        headers = _register_and_login(client, "status429@example.com")
        from app.services.meal_service import MealService

        def _raise(*args, **kwargs):
            raise GeminiRateLimitError("Limite de uso da IA atingido no momento.")

        monkeypatch.setattr(MealService, "analyze_text", _raise)

        response = client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers)
        assert response.status_code == 429

    def test_timeout_devolve_504(self, client, monkeypatch):
        headers = _register_and_login(client, "status504@example.com")
        from app.services.meal_service import MealService

        def _raise(*args, **kwargs):
            raise GeminiTimeoutError("A IA demorou demais para responder.")

        monkeypatch.setattr(MealService, "analyze_text", _raise)

        response = client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers)
        assert response.status_code == 504

    def test_erro_generico_de_analise_continua_devolvendo_422(self, client, monkeypatch):
        """Preserva o comportamento existente pra falhas que não são
        timeout/rate-limit (ex: resposta da IA fora do formato esperado)."""
        headers = _register_and_login(client, "status422@example.com")
        from app.services.meal_service import MealService
        from app.services.gemini_service import GeminiAnalysisError

        def _raise(*args, **kwargs):
            raise GeminiAnalysisError("Erro ao formatar os dados retornados pela IA.")

        monkeypatch.setattr(MealService, "analyze_text", _raise)

        response = client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers)
        assert response.status_code == 422
