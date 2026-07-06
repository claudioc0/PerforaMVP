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

# Prompt estrito mantido exatamente igual
_SYSTEM_PROMPT = """
Você é um especialista em nutrição e análise de alimentos por imagem.
Analise a refeição na imagem (ou na descrição de texto fornecida) e estime os
valores nutricionais totais do prato.

Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem ```json,
sem explicações antes ou depois. O JSON deve seguir EXATAMENTE este formato:

{
  "description": "nome curto do prato identificado",
  "calories": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "confidence": 0.0
}

Regras:
- Todos os valores numéricos devem ser números (não strings).
- "confidence" é um valor entre 0 e 1 representando sua certeza na estimativa.
- Se não conseguir identificar nenhum alimento, retorne todos os valores numéricos como 0
  e "description" como "Não identificado".
- Nunca inclua texto fora do JSON.
"""

class GeminiService:
    def __init__(self, api_key: str, model_name: Optional[str] = None):
        if not api_key:
            raise ValueError("GEMINI_API_KEY não configurada.")
            
        # Puxa o modelo direto do .env se a rota não passar nenhum, 
        # garantindo o 'gemini-2.5-flash' como reserva segura.
        self._model_name = model_name or os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
        
        # INICIALIZAÇÃO DO CLIENTE (google-genai)
        self._client = genai.Client(api_key=api_key)

    def analyze_image(self, image: Image.Image) -> MealAnalysisResult:
        try:
            # FORMATO DE CHAMADA COM CONFIGURAÇÃO DE JSON
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
            data = json.loads(raw_text)
            return MealAnalysisResult(
                description=str(data.get("description", "Refeição não identificada")),
                calories=float(data.get("calories", 0)),
                protein_g=float(data.get("protein_g", 0)),
                carbs_g=float(data.get("carbs_g", 0)),
                fat_g=float(data.get("fat_g", 0)),
                confidence=data.get("confidence"),
            )
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.error("Resposta da IA fora do formato esperado: %s", raw_text)
            raise GeminiAnalysisError(
                "A IA retornou uma resposta em formato inesperado."
            ) from exc