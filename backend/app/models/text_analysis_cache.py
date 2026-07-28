from datetime import datetime

from app.extensions import db


class TextAnalysisCache(db.Model):
    """Cache global da análise completa de uma descrição de texto (modo
    "Entrada Manual" com estimativa por IA), compartilhado entre todos os
    usuários.

    Diferente do FoodCache (que só garante consistência entre os macros de
    um alimento individual, DEPOIS que a IA já respondeu), este cache evita a
    própria chamada ao Gemini quando a mesma descrição (normalizada) já foi
    analisada antes por qualquer usuário — a alavanca de custo real, já que
    a chamada à IA nem chega a acontecer num hit.

    Não existe equivalente pro modo foto: cada imagem tem bytes diferentes
    mesmo pra pratos parecidos, então um cache por conteúdo raramente bateria.
    """

    __tablename__ = "text_analysis_cache"

    id = db.Column(db.Integer, primary_key=True)

    # SHA-256 da descrição normalizada (strip + lower + espaços colapsados).
    # Hash em vez do texto direto: descrições de refeição podem ser longas
    # (frase livre do usuário), então um hash de tamanho fixo é mais seguro
    # de indexar do que confiar num limite arbitrário de string.
    description_hash = db.Column(db.String(64), unique=True, index=True, nullable=False)

    # Itens já resolvidos (após cruzar com o FoodCache) — num hit, a resposta
    # sai pronta pra usar, sem precisar re-consultar o FoodCache item a item.
    items = db.Column(db.JSON, nullable=False)
    confidence = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
