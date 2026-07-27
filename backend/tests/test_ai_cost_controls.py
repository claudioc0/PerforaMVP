"""Contenção de custo/latência nas chamadas à IA (Gemini).

Cobre dois problemas que existiam antes desta mudança:

1. /meals/analyze e /meals/daily-insight aceitavam chamadas ilimitadas de uma
   mesma conta autenticada — cada uma aciona o Gemini, ou seja, custo real sem
   teto nenhum.
2. O GeminiService não configurava timeout nem retry no cliente — uma resposta
   lenta prendia o worker Flask indefinidamente, e uma falha transitória (5xx)
   nunca era tentada de novo.

Os testes de rota mockam o GeminiService pra não depender de rede/API key real
e rodar rápido e determinístico — o que se testa aqui é o rate limit em volta
da chamada, não a IA em si (isso já é responsabilidade de outros testes/uso
manual). Os testes de configuração do cliente inspecionam o client do SDK
diretamente, sem fazer nenhuma chamada de rede.
"""

import pytest

from app.services.gemini_service import GeminiService, MealAnalysisResult, MealItemResult


def _fake_analysis_result():
    return MealAnalysisResult(
        items=[
            MealItemResult(
                description="Item de teste",
                calories=100.0,
                protein_g=10.0,
                carbs_g=10.0,
                fat_g=5.0,
                estimated_grams=100.0,
            )
        ],
        confidence=0.9,
    )


@pytest.fixture(autouse=True)
def _mock_gemini_calls(monkeypatch):
    """Evita chamada de rede real em toda a suíte deste arquivo.

    Sem isso, cada teste dependeria de internet e de uma GEMINI_API_KEY válida,
    e ficaria lento/instável — o que queremos travar aqui é o comportamento do
    rate limit em volta da chamada, não a IA em si.
    """
    monkeypatch.setattr(GeminiService, "analyze_text", lambda self, description: _fake_analysis_result())
    monkeypatch.setattr(GeminiService, "analyze_image", lambda self, image: _fake_analysis_result())
    monkeypatch.setattr(GeminiService, "generate_daily_insight", lambda self, goals, consumed: "Continue assim!")


def _register_and_login(client, email):
    credentials = {"name": "Outro Usuário", "email": email, "password": "SenhaForte1"}
    resp = client.post("/api/auth/register", json=credentials)
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"email": email, "password": credentials["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['token']}"}


class TestRateLimitPorUsuarioNoAnalyze:
    def test_bloqueia_apos_o_limite_por_minuto(self, client, auth_headers):
        statuses = [
            client.post(
                "/api/meals/analyze", json={"description": "arroz e feijão"}, headers=auth_headers
            ).status_code
            for _ in range(11)
        ]

        # As 10 primeiras chamadas passam pelo rate limit (podem falhar por outro
        # motivo depois, mas não por 429) — a 11ª é bloqueada.
        assert 429 not in statuses[:10]
        assert statuses[10] == 429

    def test_contas_diferentes_tem_baldes_de_limite_separados(self, client, auth_headers):
        # Esgota o limite da conta principal
        for _ in range(10):
            client.post("/api/meals/analyze", json={"description": "arroz"}, headers=auth_headers)
        bloqueado = client.post(
            "/api/meals/analyze", json={"description": "arroz"}, headers=auth_headers
        )
        assert bloqueado.status_code == 429

        # Uma segunda conta, na mesma requisição de teste (mesmo "IP"), não deve
        # ser afetada — se o limite ainda fosse por IP, essa chamada já viria 429.
        outra_conta_headers = _register_and_login(client, "outra.conta@example.com")
        resposta_outra_conta = client.post(
            "/api/meals/analyze", json={"description": "arroz"}, headers=outra_conta_headers
        )
        assert resposta_outra_conta.status_code != 429

    def test_requisicao_sem_token_nao_quebra_o_rate_limit(self, client):
        # Sem Authorization, o key_func cai pro IP em vez de estourar — quem
        # rejeita a requisição por falta de token é o @jwt_required(), com 401,
        # não um erro interno do rate limiter.
        response = client.post("/api/meals/analyze", json={"description": "arroz"})
        assert response.status_code == 401


class TestRateLimitNoDailyInsight:
    def test_bloqueia_apos_o_limite_por_hora(self, client, auth_headers):
        payload = {"goals": {"goal_calories": 2000}, "consumed": {"calories": 500}}
        statuses = [
            client.post("/api/meals/daily-insight", json=payload, headers=auth_headers).status_code
            for _ in range(11)
        ]
        assert statuses[:10] == [200] * 10
        assert statuses[10] == 429


class TestGeminiServiceTimeoutERetry:
    """Inspeciona a configuração real do cliente do SDK — sem chamada de rede."""

    def test_timeout_e_configurado_no_cliente(self):
        service = GeminiService(api_key="fake-key", timeout_ms=15000, retry_attempts=3)
        http_options = service._client._api_client._http_options
        assert http_options.timeout == 15000

    def test_usa_valores_padrao_quando_nao_especificado(self, monkeypatch):
        monkeypatch.delenv("GEMINI_TIMEOUT_MS", raising=False)
        monkeypatch.delenv("GEMINI_RETRY_ATTEMPTS", raising=False)
        service = GeminiService(api_key="fake-key")
        http_options = service._client._api_client._http_options
        assert http_options.timeout == 30000
        assert http_options.retry_options.attempts == 2

    def test_retry_nao_inclui_429(self):
        # 429 é erro de cota — tentar de novo não resolve e só adiciona latência.
        # Deve ficar de fora da lista de códigos que disparam retry automático.
        service = GeminiService(api_key="fake-key")
        codes = service._client._api_client._http_options.retry_options.http_status_codes
        assert 429 not in codes
        assert {500, 502, 503, 504}.issubset(set(codes))

    def test_pior_caso_de_espera_e_limitado(self):
        # tentativas x timeout é o teto real de quanto tempo um worker fica preso
        # esperando o Gemini, mesmo se toda tentativa travar até o limite.
        service = GeminiService(api_key="fake-key", timeout_ms=30000, retry_attempts=2)
        http_options = service._client._api_client._http_options
        pior_caso_segundos = (http_options.timeout / 1000) * http_options.retry_options.attempts
        assert pior_caso_segundos <= 90
