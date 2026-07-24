import logging
import re

from app.extensions import db
from app.models import FoodCache

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    """strip + lower + colapsa espaços múltiplos — maximiza a chance de bater no cache."""
    return re.sub(r"\s+", " ", text.strip().lower())


def get_cached_or_fetch_macros(description: str, fresh_macros: dict) -> dict:
    """Garante consistência nutricional entre análises do mesmo alimento.

    Não evita a chamada ao Gemini — a foto/descrição já foi analisada antes desta
    função ser chamada (não tem como saber o que tem numa imagem sem "olhar" pra
    ela). O ganho aqui é outro: se "banana" já foi vista antes (por qualquer
    usuário), usamos os macros salvos em vez de confiar de novo na estimativa
    fresca da IA, que pode variar levemente entre chamadas mesmo pro mesmo
    alimento. Na primeira vez que um alimento aparece, a estimativa da IA vira
    a referência salva.

    Args:
        description: nome do alimento identificado pela IA (ex: "Banana").
        fresh_macros: {"calories", "protein_g", "carbs_g", "fat_g"} por 100g,
            conforme retornado pela IA nesta análise.

    Returns:
        Os macros por 100g a usar — os salvos em cache (hit) ou os frescos (miss).
    """
    search_query = _normalize(description)

    cached = FoodCache.query.filter_by(search_query=search_query).first()

    if cached:
        cached.hit_count += 1
        db.session.commit()
        return {
            "calories": cached.calories,
            "protein_g": cached.protein_g,
            "carbs_g": cached.carbs_g,
            "fat_g": cached.fat_g,
        }

    new_entry = FoodCache(
        search_query=search_query,
        calories=fresh_macros["calories"],
        protein_g=fresh_macros["protein_g"],
        carbs_g=fresh_macros["carbs_g"],
        fat_g=fresh_macros["fat_g"],
    )
    db.session.add(new_entry)
    try:
        db.session.commit()
    except Exception:
        # Corrida rara: duas análises com o mesmo alimento novo ao mesmo tempo,
        # ambas tentando criar a mesma search_query (unique constraint). Não é
        # crítico — simplesmente não guarda essa cópia, o valor fresco da IA
        # ainda é retornado normalmente pro usuário.
        db.session.rollback()
        logger.warning("Corrida ao gravar FoodCache para '%s' — seguindo sem cache.", search_query)

    return fresh_macros
