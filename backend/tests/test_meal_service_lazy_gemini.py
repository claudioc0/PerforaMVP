"""Regressão: MealService não pode construir o cliente Gemini sem precisar dele.

Antes, toda chamada a `_get_meal_service()` (em CADA rota que usa MealService
— inclusive salvar, listar, apagar refeição e resumos, que nunca chamam a
IA) construía um GeminiService novo, e o `__init__` do GeminiService monta um
genai.Client de verdade por baixo. Agora MealService recebe uma FÁBRICA
(callable sem argumentos) em vez de uma instância pronta, e só invoca essa
fábrica na primeira vez que `analyze_image`/`analyze_text` (ou a property
`_gemini_service`) são realmente usados.
"""
from unittest.mock import MagicMock

from app.services.gemini_service import GeminiService
from app.services.meal_service import MealService


def _fake_gemini_result():
    result = MagicMock()
    result.items = []
    result.confidence = 0.9
    return result


class TestConstrucaoPreguicosaDoGeminiService:
    def test_construtor_nao_invoca_a_fabrica(self):
        factory = MagicMock()
        MealService(factory)
        factory.assert_not_called()

    def test_metodos_que_nao_usam_ia_nunca_tocam_a_fabrica(self, app):
        """save_meal/get_summary_for_date/get_weekly_summary/etc não usam
        Gemini — a fábrica não pode ser chamada só por instanciar o service
        e usar esses métodos."""
        factory = MagicMock()
        service = MealService(factory)

        with app.app_context():
            from datetime import date
            service.get_summary_for_date(date.today(), user_id=999999)  # usuário inexistente, só não pode quebrar

        factory.assert_not_called()

    def test_analyze_text_invoca_a_fabrica_na_primeira_chamada(self, app):
        fake_gemini = MagicMock()
        fake_gemini.analyze_text.return_value = _fake_gemini_result()
        factory = MagicMock(return_value=fake_gemini)

        service = MealService(factory)
        factory.assert_not_called()

        with app.app_context():
            service.analyze_text("arroz")

        factory.assert_called_once()
        fake_gemini.analyze_text.assert_called_once_with("arroz")

    def test_fabrica_e_chamada_uma_unica_vez_mesmo_com_varias_analises(self, app):
        """O GeminiService construído deve ser reaproveitado dentro da mesma
        instância de MealService — não recriar o cliente a cada análise."""
        fake_gemini = MagicMock()
        fake_gemini.analyze_text.return_value = _fake_gemini_result()
        factory = MagicMock(return_value=fake_gemini)

        service = MealService(factory)
        with app.app_context():
            # Descrições diferentes — nenhuma bate no cache de texto (ver
            # test_text_analysis_cache_service.py), então o Gemini é chamado
            # nas 3 vezes; o que este teste trava é que a FÁBRICA do
            # GeminiService (não o cache) só constrói o cliente uma vez.
            service.analyze_text("arroz")
            service.analyze_text("feijão")
            service.analyze_text("frango")

        factory.assert_called_once()
        assert fake_gemini.analyze_text.call_count == 3

    def test_analyze_image_tambem_invoca_a_fabrica(self, monkeypatch):
        fake_gemini = MagicMock()
        fake_gemini.analyze_image.return_value = _fake_gemini_result()
        factory = MagicMock(return_value=fake_gemini)

        from PIL import Image
        from io import BytesIO
        buf = BytesIO()
        Image.new("RGB", (2, 2)).save(buf, format="PNG")

        service = MealService(factory)
        service.analyze_image(buf.getvalue())

        factory.assert_called_once()

    def test_generate_daily_insight_tambem_dispara_a_fabrica(self):
        """generate_daily_insight (o método público que a rota /daily-insight
        chama, sem furar a camada de serviço acessando `_gemini_service`
        diretamente) também precisa disparar a fábrica nesse caminho."""
        fake_gemini = MagicMock()
        factory = MagicMock(return_value=fake_gemini)

        service = MealService(factory)
        result = service.generate_daily_insight({"goal_calories": 2000}, {"calories": 500})

        factory.assert_called_once()
        fake_gemini.generate_daily_insight.assert_called_once_with(
            {"goal_calories": 2000}, {"calories": 500}
        )
        assert result is fake_gemini.generate_daily_insight.return_value


class TestRotasSemIANaoConstroemOGeminiService:
    """Nível de integração: confirma que a fábrica de meals_routes.py
    (_get_meal_service) também não constrói o GeminiService de verdade em
    rotas que nunca chamam a IA — a suíte acima já prova isso no nível do
    MealService, mas só isso não pegaria uma regressão introduzida na
    própria rota (ex: alguém trocar a fábrica de volta por uma instância
    pronta em meals_routes.py)."""

    def _spy_on_init(self, monkeypatch):
        """Um Mock comum não funciona pra espiar __init__ diretamente (não
        implementa o protocolo de descriptor que faz `self` ser passado
        automaticamente) — usa uma função de verdade que registra as
        chamadas e delega pro __init__ original."""
        calls = []
        original_init = GeminiService.__init__

        def spy(self, *args, **kwargs):
            calls.append((args, kwargs))
            return original_init(self, *args, **kwargs)

        monkeypatch.setattr(GeminiService, "__init__", spy)
        return calls

    def test_rota_sem_ia_nao_constroi_o_gemini_service(self, client, auth_headers, monkeypatch):
        calls = self._spy_on_init(monkeypatch)

        response = client.get("/api/meals/today", headers=auth_headers)

        assert response.status_code == 200
        assert calls == []

    def test_rota_de_analise_constroi_o_gemini_service(self, client, auth_headers, monkeypatch):
        from app.services.gemini_service import MealAnalysisResult

        monkeypatch.setattr(
            GeminiService, "analyze_text",
            lambda self, description: MealAnalysisResult(items=[], confidence=0.9),
        )
        calls = self._spy_on_init(monkeypatch)

        response = client.post(
            "/api/meals/analyze", json={"description": "arroz"}, headers=auth_headers
        )

        assert response.status_code == 200
        assert len(calls) == 1


class TestRotaNaoAcessaAtributoPrivadoDoService:
    """meals_routes.py acessava meal_service._gemini_service diretamente na
    rota /daily-insight — furando a camada de serviço que o resto do código
    respeita (toda outra rota só chama métodos públicos de MealService).
    Trava estrutural: nenhum atributo prefixado com "_" de MealService pode
    aparecer no código da rota."""

    def test_meals_routes_nao_referencia_gemini_service_diretamente(self):
        import inspect
        import re

        from app.routes import meals_routes

        source = inspect.getsource(meals_routes)
        # Busca especificamente ACESSO a atributo (".{_gemini_service}"), não
        # qualquer menção à string — o próprio arquivo cita
        # `_gemini_service` num comentário (documentando a property de
        # MealService) e usa `_build_gemini_service` como nome de função
        # local, nenhum dos dois é a violação que este teste trava.
        assert not re.search(r"\._gemini_service\b", source), (
            "meals_routes.py voltou a acessar MealService._gemini_service "
            "diretamente — use um método público de MealService "
            "(ex: generate_daily_insight) em vez de ler o atributo privado "
            "da camada de serviço."
        )
