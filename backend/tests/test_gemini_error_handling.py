"""Regressão: chamadas ao Gemini precisam classificar a falha, não engolir tudo igual.

Antes, analyze_image/analyze_text/generate_daily_insight caíam num único
`except Exception` genérico — um timeout (upstream travado), um 429 (cota
estourada) e uma resposta malformada da IA viravam o mesmo GeminiAnalysisError
genérico. A rota /analyze devolvia sempre 422, e o frontend só detectava
"rate limit" adivinhando "429"/"quota" dentro do TEXTO da mensagem de erro —
frágil e sem cobertura nenhuma pra timeout.

generate_daily_insight engolia QUALQUER falha (chave inválida, cota, outage)
e sempre devolvia sucesso (uma frase-fallback) sem nenhum log que
diferenciasse "esperado sob uso pesado" de "algo real está quebrado".
"""
import httpx
import pytest
from google.genai import errors as genai_errors

from app.services.gemini_service import (
    GeminiAnalysisError,
    GeminiRateLimitError,
    GeminiService,
    GeminiTimeoutError,
)


def _make_service():
    return GeminiService(api_key="fake-key")


def _api_error(code, message="erro de teste"):
    return genai_errors.APIError(code, {"message": message, "status": "TESTE"})


class TestClassificacaoDeErroNaChamadaAoGemini:
    def test_timeout_vira_gemini_timeout_error(self, monkeypatch):
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(httpx.ReadTimeout("timed out")),
        )

        with pytest.raises(GeminiTimeoutError):
            service.analyze_text("arroz")

    def test_429_vira_gemini_rate_limit_error(self, monkeypatch):
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(429, "quota estourada")),
        )

        with pytest.raises(GeminiRateLimitError):
            service.analyze_text("arroz")

    def test_outro_erro_de_api_vira_gemini_analysis_error_generico(self, monkeypatch):
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(500, "erro interno do gemini")),
        )

        with pytest.raises(GeminiAnalysisError) as exc_info:
            service.analyze_text("arroz")
        assert not isinstance(exc_info.value, (GeminiRateLimitError, GeminiTimeoutError))

    def test_rate_limit_error_e_um_gemini_analysis_error(self, monkeypatch):
        """Compatibilidade: quem só sabe de GeminiAnalysisError (código
        antigo) continua pegando o erro — só quem quer o detalhe extra
        precisa saber dos tipos específicos."""
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(429)),
        )

        with pytest.raises(GeminiAnalysisError):
            service.analyze_text("arroz")

    def test_classificacao_tambem_vale_pra_analyze_image(self, monkeypatch):
        from PIL import Image
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(429)),
        )

        with pytest.raises(GeminiRateLimitError):
            service.analyze_image(Image.new("RGB", (2, 2)))


class TestInsightDiarioDiferenciaSeveridadeNoLog:
    def test_rate_limit_loga_como_warning_e_devolve_fallback(self, monkeypatch, caplog):
        import logging
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(429)),
        )

        with caplog.at_level(logging.WARNING):
            result = service.generate_daily_insight({}, {})

        assert result  # continua devolvendo uma frase, não quebra o Dashboard
        assert not any(r.levelno >= logging.ERROR for r in caplog.records)

    def test_outra_falha_loga_como_error_e_devolve_fallback(self, monkeypatch, caplog):
        import logging
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(_api_error(500)),
        )

        with caplog.at_level(logging.WARNING):
            result = service.generate_daily_insight({}, {})

        assert result
        assert any(r.levelno >= logging.ERROR for r in caplog.records), (
            "uma falha que não é rate limit (chave inválida, outage, timeout) "
            "precisa deixar rastro em nível ERROR nos logs — sem isso, "
            "continua indistinguível de um sistema funcionando."
        )

    def test_timeout_tambem_loga_como_error_e_devolve_fallback(self, monkeypatch, caplog):
        import logging
        service = _make_service()
        monkeypatch.setattr(
            service._client.models, "generate_content",
            lambda **kwargs: (_ for _ in ()).throw(httpx.ReadTimeout("timed out")),
        )

        with caplog.at_level(logging.WARNING):
            result = service.generate_daily_insight({}, {})

        assert result
        assert any(r.levelno >= logging.ERROR for r in caplog.records)
