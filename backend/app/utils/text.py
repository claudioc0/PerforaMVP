"""Normalização de texto compartilhada entre caches (comida, análise por texto)."""
import re


def normalize_search_text(text: str) -> str:
    """strip + lower + colapsa espaços múltiplos — maximiza a chance de bater no cache."""
    return re.sub(r"\s+", " ", text.strip().lower())
