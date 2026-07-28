"""Regressão: descrições de texto repetidas não podem chamar o Gemini de novo.

Antes, o único cache (FoodCache) só entrava em ação DEPOIS de o Gemini já
ter respondido — só estabilizava os macros de cada alimento, nunca evitava a
chamada em si. Este cache guarda a análise COMPLETA por hash da descrição
normalizada: num hit, o Gemini nem é chamado.
"""
from unittest.mock import MagicMock

from app.extensions import db
from app.models import TextAnalysisCache
from app.services.meal_service import MealService
from app.services.text_analysis_cache_service import get_cached_analysis, save_analysis


class TestCacheDeAnaliseDeTexto:
    def test_miss_quando_nunca_foi_analisado(self, app):
        with app.app_context():
            assert get_cached_analysis("arroz com feijão") is None

    def test_save_e_depois_get_encontra_o_mesmo_resultado(self, app):
        with app.app_context():
            items = [{"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3}]
            save_analysis("Arroz com Feijão", items, 0.95)

            cached = get_cached_analysis("arroz com feijão")
            assert cached is not None
            assert cached["items"] == items
            assert cached["confidence"] == 0.95

    def test_normalizacao_ignora_espacos_e_maiusculas(self, app):
        with app.app_context():
            save_analysis("  Frango   Grelhado  ", [{"description": "x"}], 0.8)

            assert get_cached_analysis("frango grelhado") is not None
            assert get_cached_analysis("FRANGO GRELHADO") is not None

    def test_descricoes_diferentes_nao_colidem(self, app):
        with app.app_context():
            save_analysis("arroz", [{"description": "Arroz"}], 0.9)

            assert get_cached_analysis("feijão") is None

    def test_corrida_ao_salvar_o_mesmo_hash_nao_quebra(self, app):
        """Duas análises concorrentes da mesma descrição nova — a segunda
        gravação não pode derrubar a resposta que já foi devolvida ao usuário."""
        with app.app_context():
            save_analysis("arroz", [{"description": "Arroz"}], 0.9)
            # Não deve levantar (constraint única em description_hash)
            save_analysis("arroz", [{"description": "Arroz outra vez"}], 0.5)

            assert TextAnalysisCache.query.count() == 1


class TestAnalyzeTextPulaOGeminiEmCacheHit:
    def _fake_result(self):
        result = MagicMock()
        result.items = []
        result.confidence = 0.9
        return result

    def test_segunda_chamada_com_mesma_descricao_nao_chama_o_gemini(self, app):
        fake_gemini = MagicMock()
        fake_gemini.analyze_text.return_value = self._fake_result()
        service = MealService(lambda: fake_gemini)

        with app.app_context():
            service.analyze_text("arroz com feijão")
            service.analyze_text("arroz com feijão")

        assert fake_gemini.analyze_text.call_count == 1

    def test_descricoes_diferentes_chamam_o_gemini_de_novo(self, app):
        fake_gemini = MagicMock()
        fake_gemini.analyze_text.return_value = self._fake_result()
        service = MealService(lambda: fake_gemini)

        with app.app_context():
            service.analyze_text("arroz")
            service.analyze_text("feijão")

        assert fake_gemini.analyze_text.call_count == 2

    def test_resultado_do_cache_hit_e_igual_ao_da_primeira_chamada(self, app):
        fake_gemini = MagicMock()
        result = MagicMock()
        result.items = [MagicMock(description="Arroz", calories=130, protein_g=2.7, carbs_g=28, fat_g=0.3, estimated_grams=100.0)]
        result.confidence = 0.95
        fake_gemini.analyze_text.return_value = result
        service = MealService(lambda: fake_gemini)

        with app.app_context():
            first = service.analyze_text("arroz")
            second = service.analyze_text("arroz")

        assert second["items"] == first["items"]
        assert second["confidence"] == first["confidence"]
        assert second["source_type"] == "text"
