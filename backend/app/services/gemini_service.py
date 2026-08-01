import json
import logging
import os
from dataclasses import dataclass
from typing import List, Optional

import httpx

# IMPORTAÇÃO DO SDK ATUALIZADO
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from PIL import Image

logger = logging.getLogger(__name__)

class GeminiAnalysisError(Exception):
    """Erro de negócio: a IA não conseguiu analisar a refeição de forma confiável."""


class GeminiRateLimitError(GeminiAnalysisError):
    """A API do Gemini recusou a chamada por cota/rate limit (HTTP 429).

    Não é uma falha de verdade (o serviço está funcionando, só recusando
    tratar mais chamadas agora) — tentar de novo na hora não ajuda, por isso
    o SDK nunca tenta de novo sozinho pra esse código (ver http_status_codes
    em __init__). Precisa de um tipo próprio pra a rota devolver 429 (não
    422/500) e o app mostrar "espere um pouco" em vez de um erro genérico.
    """


class GeminiTimeoutError(GeminiAnalysisError):
    """A chamada à IA não respondeu dentro do timeout configurado.

    Diferente de um erro de negócio (resposta ruim/mal formatada), isso é um
    problema de infraestrutura upstream — precisa de um tipo próprio pra a
    rota devolver 504 (não 422) e diferenciar nos logs "o Gemini não
    respondeu a tempo" de "a resposta veio mas não deu pra entender".
    """

@dataclass
class MealItemResult:
    """Um alimento individual identificado na refeição (ex: só o arroz, só a banana)."""
    description: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    estimated_grams: float = 100.0

@dataclass
class MealAnalysisResult:
    items: List[MealItemResult]
    confidence: Optional[float] = None

@dataclass
class LabelAnalysisResult:
    """Um único produto lido de uma foto de rótulo/tabela nutricional — shape
    achatado (sem lista de itens), igual ao que fetchProductByBarcode já
    devolve pra um produto do OpenFoodFacts, já que a leitura de rótulo serve
    exatamente pro mesmo caminho (produtos fora do OpenFoodFacts)."""
    description: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float

# Prompt blindado com One-Shot Learning para garantir saída determinística
_SYSTEM_PROMPT = """
Você é um nutricionista esportivo especialista em visão computacional, baseando-se estritamente na Tabela TACO (Tabela Brasileira de Composição de Alimentos) e USDA.

Sua tarefa é IDENTIFICAR CADA ALIMENTO SEPARADAMENTE na imagem ou descrição da refeição — NUNCA
misture alimentos diferentes em uma média única — e retornar uma LISTA de itens, cada um com sua
própria estimativa nutricional.

REGRA DE OURO INQUEBRÁVEL (por item):
Para CADA item da lista, os valores de calorias e macronutrientes devem ser calculados EXATAMENTE
e ESTRITAMENTE para uma porção de 100 GRAMAS DAQUELE ALIMENTO ESPECÍFICO, não importando o tamanho
real da porção servida.

REGRA ABSOLUTA DE SAÍDA:
Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem ```json, sem saudações ou explicações.

Restrições Físicas Obrigatórias (Para 100g de CADA item):
- Carnes magras (frango, patinho) têm no MÁXIMO 32g de proteína por 100g. Jamais ultrapasse isso.
- O total da soma de proteína, carboidrato e gordura de UM item NUNCA pode ultrapassar 100g.

Estimativa de Peso Real (campo "estimated_grams", por item):
- Esse campo é SEPARADO da regra dos 100g acima — é a sua melhor estimativa do peso REAL daquele
  item específico, em gramas. NÃO afeta o cálculo dos macros do item, que continuam sempre por 100g.
- Se for imagem: use referências visuais (tamanho do prato, talheres, proporção entre os itens)
  pra estimar o peso de cada item individualmente.
- Se for texto e o usuário mencionar quantidades explícitas (ex: "200g de frango"), use exatamente
  essa quantidade pro item correspondente.
- Se não houver como estimar com confiança, use 100.0 como valor padrão.

Responda APENAS com um objeto JSON válido, sem formatação markdown ou textos extras, contendo a
seguinte estrutura:
{
    "items": [
        {
            "description": "Nome simples e direto do alimento (ex: Peito de Frango Grelhado)",
            "calories": numero_float_com_uma_casa_decimal,
            "protein_g": numero_float_com_uma_casa_decimal,
            "carbs_g": numero_float_com_uma_casa_decimal,
            "fat_g": numero_float_com_uma_casa_decimal,
            "estimated_grams": numero_float_com_uma_casa_decimal
        }
    ],
    "confidence": numero_float_com_uma_casa_decimal
}

EXEMPLO DE COMPORTAMENTO ESPERADO (One-Shot):
Entrada: "200g de frango grelhado e 100g de batata doce"
Saída:
{
  "items": [
    {
      "description": "Frango Grelhado",
      "calories": 165.0,
      "protein_g": 31.0,
      "carbs_g": 0.0,
      "fat_g": 3.6,
      "estimated_grams": 200.0
    },
    {
      "description": "Batata Doce",
      "calories": 86.0,
      "protein_g": 1.6,
      "carbs_g": 20.0,
      "fat_g": 0.1,
      "estimated_grams": 100.0
    }
  ],
  "confidence": 0.95
}

REGRAS DE CONTORNO:
- Todos os valores nutricionais devem ser numéricos (float/int).
- "confidence" é um valor entre 0 e 1 indicando sua certeza geral na análise.
- "items" deve ter SEMPRE pelo menos 1 elemento, mesmo que a refeição seja um alimento só.
- Se a imagem ou texto NÃO for uma comida reconhecível, retorne "items" com um único elemento de
  valores zerados e "description" como "Não identificado".
"""

# Prompt separado do de análise de refeição: aqui a tarefa é LER números já
# impressos numa embalagem, não estimar macros de um prato — instruções e
# formato de saída (objeto único, não lista de itens) são propositalmente
# diferentes do _SYSTEM_PROMPT acima.
_LABEL_SYSTEM_PROMPT = """
Você é um leitor de tabelas nutricionais. Vai receber uma FOTO de um rótulo/embalagem de produto
industrializado, contendo a Tabela de Informação Nutricional impressa.

SUA TAREFA É LER OS NÚMEROS JÁ IMPRESSOS NA TABELA, NÃO ESTIMAR. São dados exatos que já estão
escritos na embalagem — não faça suposições nem arredondamentos próprios além dos que já estão
impressos.

PRIORIDADE DE COLUNA (quando a tabela tiver mais de uma coluna de valores):
1. Prefira a coluna "por porção" (ex: "por 30g", "por unidade", "porção de 200ml") se existir.
2. Se só houver "por 100g" ou "por 100ml", use essa.
3. Nunca some ou converta unidades — use exatamente os números da coluna escolhida.

NOME DO PRODUTO:
- Se o nome do produto estiver legível na embalagem (fora da própria tabela), use-o.
- Se não for possível ler o nome com confiança, responda "description" como "Produto (rótulo)".

REGRA ABSOLUTA DE SAÍDA:
Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem ```json, sem saudações,
contendo EXATAMENTE esta estrutura (um objeto único, NÃO uma lista):
{
    "description": "Nome do produto ou 'Produto (rótulo)'",
    "calories": numero_float,
    "protein_g": numero_float,
    "carbs_g": numero_float,
    "fat_g": numero_float
}

Se a imagem não mostrar uma tabela nutricional legível, responda com todos os valores numéricos
zerados e "description" como "Rótulo não identificado".
"""

class GeminiService:
    def __init__(
        self,
        api_key: str,
        model_name: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        retry_attempts: Optional[int] = None,
    ):
        if not api_key:
            raise ValueError("GEMINI_API_KEY não configurada.")

        # Puxa o modelo direto do .env se a rota não passar nenhum,
        # garantindo o 'gemini-2.5-flash' como reserva veloz e segura.
        self._model_name = model_name or os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

        # Sem isso, uma resposta lenta do Gemini prendia o worker Flask que
        # atendeu a requisição indefinidamente (nenhum timeout era aplicado por
        # padrão pelo SDK), e uma falha transitória (5xx) nunca era tentada de
        # novo (o SDK só tenta de novo se retry_options for explicitamente
        # configurado — sem isso, é sempre 1 tentativa só).
        #
        # 429 (cota/rate limit do próprio Gemini) fica de FORA da lista de
        # retry de propósito: tentar de novo um erro de cota não resolve nada
        # e só adiciona latência — melhor devolver o 429 pro cliente na hora,
        # que já tem tratamento próprio pra esse caso (ver CameraScreen/
        # ManualEntryScreen no frontend).
        http_options = types.HttpOptions(
            timeout=timeout_ms or int(os.getenv("GEMINI_TIMEOUT_MS", "30000")),
            retry_options=types.HttpRetryOptions(
                attempts=retry_attempts or int(os.getenv("GEMINI_RETRY_ATTEMPTS", "2")),
                initial_delay=1.0,
                max_delay=6.0,
                exp_base=2.0,
                jitter=0.5,
                http_status_codes=[408, 500, 502, 503, 504],
            ),
        )

        # INICIALIZAÇÃO DO CLIENTE (google-genai)
        self._client = genai.Client(api_key=api_key, http_options=http_options)

    def _generate_content(self, contents, config=None, log_context: str = ""):
        """Chama o Gemini e classifica a falha (se houver) num tipo específico.

        Antes, TUDO caía num `except Exception` genérico: um timeout (o SDK
        nunca tenta de novo — só reduz o tempo de travamento, não elimina o
        erro) e um 429 de cota (também nunca tentado de novo, de propósito —
        ver GeminiRateLimitError) viravam o mesmo GeminiAnalysisError
        genérico que um JSON mal formatado. Sem diferenciar, a rota não tinha
        como devolver o status HTTP certo (429 vs 504 vs 422), e o frontend
        só conseguia detectar rate limit adivinhando "429"/"quota" dentro do
        texto da mensagem de erro — frágil, e não cobria timeout nenhum.
        """
        try:
            return self._client.models.generate_content(
                model=self._model_name, contents=contents, config=config,
            )
        except httpx.TimeoutException as exc:
            logger.error("Timeout ao chamar a API do Gemini%s: %s", log_context, exc)
            raise GeminiTimeoutError(
                "A IA demorou demais para responder. Tente novamente."
            ) from exc
        except genai_errors.APIError as exc:
            if exc.code == 429:
                logger.warning("Rate limit do Gemini atingido%s: %s", log_context, exc)
                raise GeminiRateLimitError(
                    "Limite de uso da IA atingido no momento. Tente novamente em instantes."
                ) from exc
            logger.error("Erro da API do Gemini (código %s)%s: %s", exc.code, log_context, exc)
            raise GeminiAnalysisError(f"Erro ao comunicar com a IA: {exc}") from exc
        except Exception as exc:
            logger.exception("Falha inesperada ao chamar a API do Gemini%s", log_context)
            raise GeminiAnalysisError(f"Erro ao comunicar com a IA: {exc}") from exc

    def analyze_image(self, image: Image.Image) -> MealAnalysisResult:
        response = self._generate_content(
            contents=[image, "Analise esta refeição e retorne o JSON conforme instruído."],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json"
            ),
            log_context=" (imagem)",
        )
        return self._parse_response(response.text)

    def analyze_text(self, description: str) -> MealAnalysisResult:
        prompt = f"Refeição descrita pelo usuário: {description}"
        response = self._generate_content(
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json"
            ),
            log_context=" (texto)",
        )
        return self._parse_response(response.text)

    def analyze_label(self, image: Image.Image) -> LabelAnalysisResult:
        response = self._generate_content(
            contents=[image, "Leia esta tabela nutricional e retorne o JSON conforme instruído."],
            config=types.GenerateContentConfig(
                system_instruction=_LABEL_SYSTEM_PROMPT,
                response_mime_type="application/json"
            ),
            log_context=" (rótulo)",
        )
        return self._parse_label_response(response.text)

    # O prompt em si (as instruções pro Gemini) fica sempre em português —
    # só a INSTRUÇÃO DE IDIOMA DE SAÍDA muda. O modelo entende a tarefa
    # igual em qualquer caso, só responde no idioma pedido nesta linha.
    _INSIGHT_LANGUAGE_INSTRUCTIONS = {
        "pt": "Responda em português do Brasil.",
        "en": "Respond in English.",
        "es": "Responde en español.",
    }

    # Mesmo texto do fallback abaixo, por idioma — usado quando a IA falha
    # (rate limit ou qualquer outro erro) e não há resposta nenhuma pra
    # devolver ao Dashboard.
    _INSIGHT_FALLBACK_TEXT = {
        "pt": "Continue focado nas suas metas. Cada refeição conta para sua alta performance!",
        "en": "Stay focused on your goals. Every meal counts toward your peak performance!",
        "es": "Sigue enfocado en tus metas. ¡Cada comida cuenta para tu máximo rendimiento!",
    }

    def generate_daily_insight(self, goals: dict, consumed: dict, language: str = "pt") -> str:
        """Gera uma frase de feedback baseada no consumo atual vs metas."""
        language = language if language in self._INSIGHT_LANGUAGE_INSTRUCTIONS else "pt"

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

        IDIOMA DA RESPOSTA: {self._INSIGHT_LANGUAGE_INSTRUCTIONS[language]}
        """

        # O card de insight sempre devolve uma frase (mesmo se a IA falhar —
        # não vale quebrar o Dashboard por um recurso secundário). O que
        # antes faltava era DIFERENCIAR a falha no log: tudo (chave inválida,
        # cota estourada, outage total) virava a mesma linha genérica de
        # exceção, indistinguível de um sistema funcionando — nenhum sinal
        # chegava até quem opera o serviço. Agora rate limit (esperado sob
        # uso pesado, não é uma falha de verdade) vira WARNING; qualquer
        # outra causa (chave inválida, outage, timeout) vira ERROR — grepável
        # nos logs, e a base pra ligar um alerta de verdade no futuro.
        try:
            response = self._generate_content(contents=prompt, log_context=" (insight diário)")
            return response.text.strip()
        except GeminiRateLimitError:
            return self._INSIGHT_FALLBACK_TEXT[language]
        except GeminiAnalysisError:
            logger.error("Insight diário não gerado — ver a causa raiz no log acima.")
            return self._INSIGHT_FALLBACK_TEXT[language]

    @staticmethod
    def _parse_item(raw_item: dict) -> MealItemResult:
        calories = round(float(raw_item.get("calories", 0)), 1)
        protein_g = round(float(raw_item.get("protein_g", 0)), 1)
        carbs_g = round(float(raw_item.get("carbs_g", 0)), 1)
        fat_g = round(float(raw_item.get("fat_g", 0)), 1)
        description = str(raw_item.get("description", "Alimento não identificado"))

        # Estimativa de peso real é só uma sugestão pro usuário confirmar — se vier
        # ausente ou fora do formato esperado, cai pro padrão de 100g sem quebrar a análise.
        try:
            estimated_grams = round(float(raw_item.get("estimated_grams", 100.0)), 1)
            if estimated_grams <= 0:
                estimated_grams = 100.0
        except (TypeError, ValueError):
            estimated_grams = 100.0

        return MealItemResult(
            description=description,
            calories=calories,
            protein_g=protein_g,
            carbs_g=carbs_g,
            fat_g=fat_g,
            estimated_grams=estimated_grams,
        )

    @classmethod
    def _parse_response(cls, raw_text: str) -> MealAnalysisResult:
        try:
            data = json.loads(raw_text)
            if not isinstance(data, dict):
                raise ValueError("Resposta da IA não é um objeto JSON.")

            raw_items = data.get("items")
            # isinstance checado ANTES do "not raw_items": sem isso, um "items"
            # que viesse como string (não uma lista) passava dessa checagem
            # (string não-vazia é truthy) e quebrava mais adiante com um
            # AttributeError não tratado ('str' object has no attribute 'get'
            # dentro de _parse_item, iterando os CARACTERES da string) — um
            # erro cru que nem esse except pegava, em vez do
            # GeminiAnalysisError esperado.
            if not isinstance(raw_items, list) or not raw_items:
                raise ValueError("Resposta da IA não contém uma lista de itens.")

            items = [cls._parse_item(raw_item) for raw_item in raw_items]
            confidence = round(float(data.get("confidence", 0.0)), 2)

            return MealAnalysisResult(items=items, confidence=confidence)
        except (json.JSONDecodeError, TypeError, ValueError, AttributeError) as exc:
            logger.error("Resposta da IA fora do formato esperado: %s", raw_text)
            raise GeminiAnalysisError("Erro ao formatar os dados retornados pela IA.") from exc

    @classmethod
    def _parse_label_response(cls, raw_text: str) -> LabelAnalysisResult:
        try:
            data = json.loads(raw_text)
            if not isinstance(data, dict):
                raise ValueError("Resposta da IA não é um objeto JSON.")

            return LabelAnalysisResult(
                description=str(data.get("description", "Produto (rótulo)")),
                calories=round(float(data.get("calories", 0)), 1),
                protein_g=round(float(data.get("protein_g", 0)), 1),
                carbs_g=round(float(data.get("carbs_g", 0)), 1),
                fat_g=round(float(data.get("fat_g", 0)), 1),
            )
        except (json.JSONDecodeError, TypeError, ValueError, AttributeError) as exc:
            logger.error("Resposta da IA (rótulo) fora do formato esperado: %s", raw_text)
            raise GeminiAnalysisError("Erro ao formatar os dados retornados pela IA.") from exc
