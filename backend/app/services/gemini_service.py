import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

# IMPORTAÇÃO DO SDK ATUALIZADO
from google import genai
from google.genai import types
from PIL import Image

logger = logging.getLogger(__name__)

class GeminiAnalysisError(Exception):
    """Erro de negócio: a IA não conseguiu analisar a refeição de forma confiável."""

@dataclass
class MealAnalysisResult:
    description: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: Optional[float] = None

# Prompt blindado com One-Shot Learning para garantir saída determinística
_SYSTEM_PROMPT = """
Você é um nutricionista esportivo especialista em visão computacional, baseando-se estritamente na Tabela TACO (Tabela Brasileira de Composição de Alimentos) e USDA.

Sua tarefa é analisar a imagem ou a descrição da refeição e retornar uma estimativa nutricional com uma REGRA DE OURO INQUEBRÁVEL: 
TODOS os valores de calorias e macronutrientes devem ser calculados EXATAMENTE e ESTRITAMENTE para uma porção de 100 GRAMAS da refeição apresentada, não importando o tamanho real do prato.
REGRA ABSOLUTA DE SAÍDA:
Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem ```json, sem saudações ou explicações.

Restrições Físicas Obrigatórias (Para 100g):
- Carnes magras (frango, patinho) têm no MÁXIMO 32g de proteína por 100g. Jamais ultrapasse isso.
- O total da soma de proteína, carboidrato e gordura NUNCA pode ultrapassar 100g.
- Se for um prato misto (ex: arroz, feijão e carne), faça uma média proporcional baseada em 100g dessa mistura.

Responda APENAS com um objeto JSON válido, sem formatação markdown ou textos extras, contendo a seguinte estrutura:
{
    "description": "Nome simples e direto do prato (ex: Peito de Frango Grelhado)",
    "calories": numero_float_com_uma_casa_decimal,
    "protein_g": numero_float_com_uma_casa_decimal,
    "carbs_g": numero_float_com_uma_casa_decimal,
    "fat_g": numero_float_com_uma_casa_decimal,
    "confidence": numero_float_com_uma_casa_decimal
}

EXEMPLO DE COMPORTAMENTO ESPERADO (One-Shot):
Entrada: "200g de frango grelhado e 100g de batata doce"
Saída:
{
  "description": "Frango Grelhado e Batata Doce",
  "calories": 415.0,
  "protein_g": 62.0,
  "carbs_g": 20.0,
  "fat_g": 7.0,
  "confidence": 0.95
}

REGRAS DE CONTORNO:
- Todos os valores nutricionais devem ser numéricos (float/int).
- "confidence" é um valor entre 0 e 1 indicando sua certeza na estimativa.
- Se a imagem ou texto NÃO for uma comida reconhecível, retorne TODOS os valores nutricionais como 0 e "description" como "Não identificado".
"""

class GeminiService:
    def __init__(self, api_key: str, model_name: Optional[str] = None):
        if not api_key:
            raise ValueError("GEMINI_API_KEY não configurada.")
            
        # Puxa o modelo direto do .env se a rota não passar nenhum, 
        # garantindo o 'gemini-2.5-flash' como reserva veloz e segura.
        self._model_name = model_name or os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
        
        # INICIALIZAÇÃO DO CLIENTE (google-genai)
        self._client = genai.Client(api_key=api_key)

    def analyze_image(self, image: Image.Image) -> MealAnalysisResult:
        try:
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=[image, "Analise esta refeição e retorne o JSON conforme instruído."],
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    response_mime_type="application/json"
                )
            )
        except Exception as exc:
            logger.exception("Falha ao chamar a API do Gemini")
            raise GeminiAnalysisError(f"Erro ao comunicar com a IA: {exc}") from exc

        return self._parse_response(response.text)

    def analyze_text(self, description: str) -> MealAnalysisResult:
        try:
            prompt = f"Refeição descrita pelo usuário: {description}"
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_PROMPT,
                    response_mime_type="application/json"
                )
            )
        except Exception as exc:
            logger.exception("Falha ao chamar a API do Gemini (texto)")
            raise GeminiAnalysisError(f"Erro ao comunicar com a IA: {exc}") from exc

        return self._parse_response(response.text)

    @staticmethod
    def _parse_response(raw_text: str) -> MealAnalysisResult:
        try:
            # 1. Converte o texto da IA para um dicionário Python
            data = json.loads(raw_text)

            # 2. TRAVA DE SEGURANÇA: Garante a formatação correta dos números
            calories = round(float(data.get("calories", 0)), 1)
            protein_g = round(float(data.get("protein_g", 0)), 1)
            carbs_g = round(float(data.get("carbs_g", 0)), 1)
            fat_g = round(float(data.get("fat_g", 0)), 1)
            confidence = round(float(data.get("confidence", 0.0)), 2)
            description = str(data.get("description", "Refeição não identificada"))

            # 3. Retorna o objeto limpo e formatado
            return MealAnalysisResult(
                description=description,
                calories=calories,
                protein_g=protein_g,
                carbs_g=carbs_g,
                fat_g=fat_g,
                confidence=confidence,
            )
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.error("Resposta da IA fora do formato esperado: %s", raw_text)
            raise GeminiAnalysisError("Erro ao formatar os números retornados pela IA.") from exc