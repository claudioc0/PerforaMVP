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
    estimated_grams: float = 100.0

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

Estimativa de Peso Real (campo "estimated_grams"):
- Esse campo é SEPARADO da regra dos 100g acima — ele é a sua melhor estimativa do peso REAL
  da porção mostrada na imagem ou descrita no texto, em gramas. NÃO afeta o cálculo dos macros,
  que continuam sempre por 100g.
- Se for imagem: use referências visuais (diâmetro típico de um prato raso ~26cm, talheres,
  altura da comida no prato) pra estimar o peso total do que está servido.
- Se for texto e o usuário mencionar uma quantidade explícita (ex: "200g de frango"), use
  exatamente essa quantidade somada aos outros itens.
- Se não houver como estimar com confiança, use 100.0 como valor padrão.

Responda APENAS com um objeto JSON válido, sem formatação markdown ou textos extras, contendo a seguinte estrutura:
{
    "description": "Nome simples e direto do prato (ex: Peito de Frango Grelhado)",
    "calories": numero_float_com_uma_casa_decimal,
    "protein_g": numero_float_com_uma_casa_decimal,
    "carbs_g": numero_float_com_uma_casa_decimal,
    "fat_g": numero_float_com_uma_casa_decimal,
    "confidence": numero_float_com_uma_casa_decimal,
    "estimated_grams": numero_float_com_uma_casa_decimal
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
  "confidence": 0.95,
  "estimated_grams": 300.0
}

REGRAS DE CONTORNO:
- Todos os valores nutricionais devem ser numéricos (float/int).
- "confidence" é um valor entre 0 e 1 indicando sua certeza na estimativa.
- Se a imagem ou texto NÃO for uma comida reconhecível, retorne TODOS os valores nutricionais como 0,
  "description" como "Não identificado" e "estimated_grams" como 100.0.
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
    
    def generate_daily_insight(self, goals: dict, consumed: dict) -> str:
        """Gera uma frase de feedback baseada no consumo atual vs metas."""
        
        prompt = f"""
        Você é o nutricionista esportivo de alta performance do app Perfora.
        
        METAS DO USUÁRIO PARA HOJE:
        - Calorias: {goals.get('goal_calories', 0)} kcal
        - Proteína: {goals.get('goal_protein_g', 0)} g
        - Carboidrato: {goals.get('goal_carbs_g', 0)} g
        - Gordura: {goals.get('goal_fat_g', 0)} g
        
        O QUE ELE JÁ CONSUMIU HOJE:
        - Calorias: {consumed.get('calories', 0)} kcal
        - Proteína: {consumed.get('protein_g', 0)} g
        - Carboidrato: {consumed.get('carbs_g', 0)} g
        - Gordura: {consumed.get('fat_g', 0)} g
        
        Tarefa: Gere UMA ÚNICA FRASE curta (máximo 2 linhas), técnica e motivadora avaliando o dia de hoje.
        - Se a proteína estiver boa, elogie a recuperação muscular.
        - Se as calorias estiverem estourando, dê um aviso amigável.
        - Se estiver longe das metas, incentive a próxima refeição.
        
        NÃO use formatação markdown, hashtags ou saudações. Apenas a frase de impacto.
        """
        
        try:
            response = self._client.models.generate_content(
                model=self._model_name,
                contents=prompt,
            )
            return response.text.strip()
        except Exception:
            logger.exception("Falha ao gerar insight diário com a IA.")
            return "Continue focado nas suas metas. Cada refeição conta para sua alta performance!"

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

            # Estimativa de peso real é só uma sugestão pro usuário confirmar — se vier
            # ausente ou fora do formato esperado, cai pro padrão de 100g sem quebrar a análise.
            try:
                estimated_grams = round(float(data.get("estimated_grams", 100.0)), 1)
                if estimated_grams <= 0:
                    estimated_grams = 100.0
            except (TypeError, ValueError):
                estimated_grams = 100.0

            # 3. Retorna o objeto limpo e formatado
            return MealAnalysisResult(
                description=description,
                calories=calories,
                protein_g=protein_g,
                carbs_g=carbs_g,
                fat_g=fat_g,
                confidence=confidence,
                estimated_grams=estimated_grams,
            )
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.error("Resposta da IA fora do formato esperado: %s", raw_text)
            raise GeminiAnalysisError("Erro ao formatar os números retornados pela IA.") from exc