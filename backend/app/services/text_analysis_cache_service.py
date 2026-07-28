"""Cache da análise COMPLETA de uma descrição em texto — evita a própria
chamada ao Gemini (não só estabiliza o valor depois, como o FoodCache).

Ver TextAnalysisCache (app/models/text_analysis_cache.py) para o porquê de
só existir pro modo texto, não pro modo foto.
"""
import hashlib
import logging
from typing import Optional

from app.extensions import db
from app.models import TextAnalysisCache
from app.utils.text import normalize_search_text

logger = logging.getLogger(__name__)


def _hash_description(description: str) -> str:
    normalized = normalize_search_text(description)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def get_cached_analysis(description: str) -> Optional[dict]:
    """Devolve {"items": [...], "confidence": float} se essa descrição
    (normalizada) já foi analisada antes, ou None num miss."""
    entry = TextAnalysisCache.query.filter_by(
        description_hash=_hash_description(description)
    ).first()
    if not entry:
        return None
    return {"items": entry.items, "confidence": entry.confidence}


def save_analysis(description: str, items: list, confidence: Optional[float]) -> None:
    """Grava o resultado já resolvido (pós FoodCache) pra evitar a chamada ao
    Gemini na próxima vez que essa mesma descrição aparecer."""
    entry = TextAnalysisCache(
        description_hash=_hash_description(description),
        items=items,
        confidence=confidence,
    )
    db.session.add(entry)
    try:
        db.session.commit()
    except Exception:
        # Corrida rara: duas análises da mesma descrição nova ao mesmo tempo,
        # ambas tentando gravar o mesmo hash (unique constraint). Não é
        # crítico — a resposta já foi devolvida ao usuário; só não guarda
        # essa cópia extra, a próxima chamada idêntica tenta de novo.
        db.session.rollback()
        logger.warning("Corrida ao gravar TextAnalysisCache — seguindo sem cache.")
