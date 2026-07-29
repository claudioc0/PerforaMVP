"""Regressão: o parser da resposta de leitura de rótulo
(GeminiService._parse_label_response) — mesma lógica pura de
test_gemini_response_parser.py, mas pro shape achatado (objeto único, sem
lista de itens) que analyze_label devolve.
"""
import pytest

from app.services.gemini_service import GeminiAnalysisError, GeminiService


class TestParseLabelResponseComJsonValido:
    def test_extrai_produto_corretamente(self):
        raw = """
        {
            "description": "Barra de Proteína XYZ",
            "calories": 200.0,
            "protein_g": 20.0,
            "carbs_g": 15.0,
            "fat_g": 6.0
        }
        """
        result = GeminiService._parse_label_response(raw)

        assert result.description == "Barra de Proteína XYZ"
        assert result.calories == 200.0
        assert result.protein_g == 20.0
        assert result.carbs_g == 15.0
        assert result.fat_g == 6.0

    def test_valores_numericos_sao_arredondados_para_uma_casa_decimal(self):
        raw = '{"description": "X", "calories": 100.456, "protein_g": 1.111, "carbs_g": 2.999, "fat_g": 0.05}'
        result = GeminiService._parse_label_response(raw)

        assert result.calories == 100.5
        assert result.protein_g == 1.1
        assert result.carbs_g == 3.0
        assert result.fat_g == 0.1

    def test_valores_numericos_como_string_sao_convertidos(self):
        raw = '{"description": "X", "calories": "200.0", "protein_g": "20", "carbs_g": "15", "fat_g": "6"}'
        result = GeminiService._parse_label_response(raw)

        assert result.calories == 200.0
        assert result.protein_g == 20.0


class TestParseLabelResponseComCamposAusentes:
    def test_campos_numericos_ausentes_caem_para_zero(self):
        result = GeminiService._parse_label_response('{"description": "Só descrição"}')

        assert result.calories == 0
        assert result.protein_g == 0
        assert result.carbs_g == 0
        assert result.fat_g == 0

    def test_description_ausente_cai_para_texto_padrao(self):
        result = GeminiService._parse_label_response('{"calories": 100, "protein_g": 1, "carbs_g": 1, "fat_g": 1}')
        assert result.description == "Produto (rótulo)"


class TestParseLabelResponseComRespostaMalFormada:
    def test_json_invalido_levanta_gemini_analysis_error(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_label_response("isso não é JSON nenhum")

    def test_resposta_e_uma_lista_em_vez_de_objeto_levanta_erro(self):
        """A leitura de rótulo devolve um objeto único, não uma lista de
        itens (diferente de analyze_image/analyze_text) — se o modelo
        responder no formato errado (lista), deve falhar, não silenciosamente
        aceitar o shape errado."""
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_label_response('[{"description": "X", "calories": 1}]')

    def test_campo_numerico_com_texto_nao_numerico_levanta_erro(self):
        with pytest.raises(GeminiAnalysisError):
            GeminiService._parse_label_response(
                '{"description": "X", "calories": "não é número", "protein_g": 1, "carbs_g": 1, "fat_g": 1}'
            )
