from datetime import datetime

from app.extensions import db


class FoodCache(db.Model):
    """Cache global de macros por alimento (sempre por 100g), compartilhado entre
    todos os usuários.

    Garante consistência nutricional: uma vez que "banana" é analisada, toda
    análise futura — de qualquer usuário, em qualquer foto — usa os mesmos
    macros de referência em vez de confiar de novo numa estimativa fresca da
    IA (que pode variar levemente entre chamadas, mesmo para o mesmo alimento).
    """

    __tablename__ = "food_cache"

    id = db.Column(db.Integer, primary_key=True)

    # Chave de busca normalizada (strip + lower + espaços colapsados)
    search_query = db.Column(db.String(255), unique=True, index=True, nullable=False)

    # Nome de exibição (com acentos/maiúsculas), pra mostrar nos resultados de
    # busca do catálogo — o search_query normalizado é só a chave de lookup.
    name = db.Column(db.String(255), nullable=True)

    calories = db.Column(db.Float, nullable=False)
    protein_g = db.Column(db.Float, nullable=False)
    carbs_g = db.Column(db.Float, nullable=False)
    fat_g = db.Column(db.Float, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Quantas vezes usamos o valor salvo em vez do que a IA calculou de novo
    hit_count = db.Column(db.Integer, default=1)
