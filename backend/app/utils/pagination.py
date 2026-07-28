"""Paginação compartilhada entre os endpoints de listagem.

Sem isso, cada listagem (histórico de peso, treinos, favoritos, catálogo de
exercícios) devolvia a tabela inteira do usuário/global sempre — com anos de
uso, uma resposta só vira centenas de linhas. `page`/`per_page` são opcionais
e sempre limitados por um teto: quem não manda nada continua recebendo os
resultados mais recentes (um comportamento parecido com "sem paginação" para
o uso comum de hoje), mas a resposta nunca cresce sem fim.
"""
from flask import request

DEFAULT_PER_PAGE = 50
MAX_PER_PAGE = 100


def get_pagination_params() -> tuple:
    """Lê `page`/`per_page` da query string, sempre dentro de limites seguros."""
    page = request.args.get("page", default=1, type=int) or 1
    per_page = request.args.get("per_page", default=DEFAULT_PER_PAGE, type=int) or DEFAULT_PER_PAGE
    page = max(page, 1)
    per_page = min(max(per_page, 1), MAX_PER_PAGE)
    return page, per_page


def paginate_query(query, page: int, per_page: int) -> tuple:
    """Aplica offset/limit numa Query do SQLAlchemy e devolve (itens, total)."""
    total = query.order_by(None).count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, total


def pagination_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "has_more": page * per_page < total,
    }
