"""Regressão: o parser da resposta do Gemini (GeminiService._parse_response/
_parse_item) nunca tinha teste nenhum — toda a suíte de IA existente
monkeypatcha analyze_image/analyze_text ou constrói um MealAnalysisResult
direto, pulando por cima da lógica que de fato converte o texto cru que a
IA devolve (potencialmente mal formatado, incompleto, ou com tipos
inesperados) na estrutura que o resto do app consome.

Aqui chamamos _parse_response/_parse_item diretamente com strings/dicts
crus, sem nenhum mock de rede — é lógica pura, não precisa de um
GeminiService de verdade nem de chave de API.
"""
import pytest

from app.services.gemini_service import GeminiAnalysisError, GeminiService


class TestParseResponseComJsonValido:
    def test_extrai_items_e_confidence_corretamente(self):
        raw = """
        {
            "items": [
                {"description": "Frango Grelhado", "calories": 165.0, "protein_g": 31.0, "carbs_g": 0.0, "fat_g": 3.6, "estimated_grams": 200.0}
            ],
            "confidence": 0.95
        }
        """
        result = GeminiService._parse_response(raw)

        assert result.confidence == 0.95
        assert len(result.items) == 1
        item = result.items[0]
        assert item.description == "Frango Grelhado"
        assert item.calories == 165.0
        assert item.protein_g == 31.0
        assert item.carbs_g == 0.0
        assert item.fat_g == 3.6
        assert item.estimated_grams == 200.0

    def test_multiplos_items_sao_preservados_na_ordem(self):
        raw = """
        {
            "items": [
                {"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3},
                {"description": "Feijão", "calories": 90, "protein_g": 6, "carbs_g": 16, "fat_g": 0.5}
            ],
            "confidence": 0.8
        }
        """
        result = GeminiService._parse_response(raw)

        assert [item.description for item in result.items] == ["Arroz", "Feijão"]

    def test_valores_numericos_sao_arredondados_para_uma_casa_decimal(self):
        raw = """
        {
            "items": [
                {"description": "Item", "calories": 100.456, "protein_g": 1.111, "carbs_g": 2.999, "fat_g": 0.05}
            ],
            "confidence": 0.7777
        }
        """
        result = GeminiService._parse_response(raw)

        item = result.items[0]
        assert item.calories == 100.5
        assert item.protein_g == 1.1
        assert item.carbs_g == 3.0
        assert item.fat_g == 0.1
        assert result.confidence == 0.78


class TestParseResponseComRespostaMalFormada:
    def test_json_invalido_levanta_gemini_analysis_error(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response("isso não é JSON nenhum")

    def test_json_valido_mas_sem_a_chave_items_levanta_erro(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('{"confidence": 0.5}')

    def test_items_vazio_levanta_erro(self):
        """items=[] é tecnicamente JSON válido, mas o prompt exige pelo menos
        1 item — uma lista vazia é tratada como resposta inválida, não como
        "refeição sem itens"."""
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('{"items": [], "confidence": 0.5}')

    def test_items_nao_e_uma_lista_levanta_erro(self):
        """items como string (não uma lista) passava despercebido pela
        checagem antiga (`if not raw_items`, e uma string não-vazia é
        truthy) e quebrava mais adiante com um AttributeError cru, iterando
        os CARACTERES da string em vez de levantar o GeminiAnalysisError
        esperado."""
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('{"items": "não é uma lista", "confidence": 0.5}')

    def test_item_dentro_da_lista_que_nao_e_um_objeto_levanta_erro(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('{"items": [1, 2, 3], "confidence": 0.5}')

    def test_resposta_e_um_json_valido_mas_nao_e_um_objeto_levanta_erro(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('[1, 2, 3]')

        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response('"só uma string"')

    def test_resposta_com_cerca_de_markdown_levanta_erro(self):
        """O prompt pede explicitamente "sem markdown, sem ```json" — se o
        modelo ignorar essa instrução, o parser não tenta ser esperto e
        extrair o JSON de dentro da cerca; falha de forma clara em vez de
        arriscar interpretar algo errado."""
        raw = '```json\n{"items": [{"description": "X", "calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1}]}\n```'
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_response(raw)


class TestParseItemComCamposAusentesOuInesperados:
    def test_campos_numericos_ausentes_caem_para_zero(self):
        item = GeminiService._parse_item({"description": "Só descrição"})

        assert item.calories == 0
        assert item.protein_g == 0
        assert item.carbs_g == 0
        assert item.fat_g == 0

    def test_description_ausente_cai_para_texto_padrao(self):
        item = GeminiService._parse_item({"calories": 100, "protein_g": 1, "carbs_g": 1, "fat_g": 1})
        assert item.description == "Alimento não identificado"

    def test_estimated_grams_ausente_cai_para_100(self):
        item = GeminiService._parse_item({"description": "X", "calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1})
        assert item.estimated_grams == 100.0

    def test_estimated_grams_zero_ou_negativo_cai_para_100(self):
        """Peso zero ou negativo não faz sentido físico — trata como ausente
        em vez de propagar um valor inválido pro resto do app."""
        item_zero = GeminiService._parse_item(
            {"description": "X", "calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1, "estimated_grams": 0}
        )
        item_negativo = GeminiService._parse_item(
            {"description": "X", "calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1, "estimated_grams": -50}
        )
        assert item_zero.estimated_grams == 100.0
        assert item_negativo.estimated_grams == 100.0

    def test_estimated_grams_com_tipo_invalido_cai_para_100_sem_quebrar(self):
        item = GeminiService._parse_item(
            {"description": "X", "calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1, "estimated_grams": "muito"}
        )
        assert item.estimated_grams == 100.0

    def test_valores_numericos_como_string_sao_convertidos(self):
        """A IA às vezes devolve números como string ("165.0" em vez de
        165.0) — o parser precisa aceitar isso, não só float/int nativos."""
        item = GeminiService._parse_item(
            {"description": "X", "calories": "165.0", "protein_g": "31", "carbs_g": "0", "fat_g": "3.6"}
        )
        assert item.calories == 165.0
        assert item.protein_g == 31.0

    def test_campo_numerico_com_texto_nao_numerico_levanta_erro(self):
        """Diferente de estimated_grams (que tem fallback pra 100), os macros
        em si não têm um valor "neutro" razoável — melhor falhar alto (e a
        rota devolve 422) do que salvar uma refeição com macros zerados
        silenciosamente por causa de uma resposta malformada."""
        with pytest.raises((TypeError, ValueError)):
            GeminiService._parse_item({"description": "X", "calories": "não é número", "protein_g": 1, "carbs_g": 1, "fat_g": 1})
