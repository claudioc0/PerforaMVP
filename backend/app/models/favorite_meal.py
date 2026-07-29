from sqlalchemy import event

from app.extensions import db
from app.utils.meal_aggregation import compute_macro_totals_from_items

class FavoriteMeal(db.Model):
    __tablename__ = 'favorite_meals'
    __table_args__ = (
        # Nada impedia favoritar a mesma refeição várias vezes — a lista
        # crescia com duplicatas idênticas sem limite nenhum.
        db.UniqueConstraint('user_id', 'description', name='uq_favorite_meals_user_description'),
    )

    id = db.Column(db.Integer, primary_key=True)
    # get_favorites (agora paginado) filtra por user_id em toda chamada — sem
    # índice, tanto o COUNT quanto o LIMIT/OFFSET varrem a tabela inteira.
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    description = db.Column(db.String(255), nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein_g = db.Column(db.Float, nullable=False)
    carbs_g = db.Column(db.Float, nullable=False)
    fat_g = db.Column(db.Float, nullable=False)

    # Detalhamento por alimento (mesmo shape de Meal.items: lista de
    # {description, calories, protein_g, carbs_g, fat_g, quantity_g}). Nulo
    # pra favoritos antigos/simples (uma refeição achatada, sem combo) — nesse
    # caso os campos acima já são a própria refeição, como item único implícito.
    items = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "items": self.items or [],
        }


@event.listens_for(FavoriteMeal, "before_insert")
@event.listens_for(FavoriteMeal, "before_update")
def _recompute_aggregate_from_items(mapper, connection, target: FavoriteMeal) -> None:
    """Quando há detalhamento por item (prato composto), os macros
    (calories/protein_g/...) são SEMPRE derivados da soma dos itens, nunca do
    que o chamador passou — mesmo invariante de Meal (ver meal.py).

    Diferente de Meal, a `description` NÃO é recalculada aqui: é o nome que o
    usuário deu ao combo (ex: "Marmita de terça"), não uma lista de
    alimentos concatenada — sobrescrever isso destruiria o propósito do
    recurso (um nome memorável escolhido de propósito).
    """
    items = target.items
    if not items:
        return

    totals = compute_macro_totals_from_items(items)
    target.calories = totals["calories"]
    target.protein_g = totals["protein_g"]
    target.carbs_g = totals["carbs_g"]
    target.fat_g = totals["fat_g"]
