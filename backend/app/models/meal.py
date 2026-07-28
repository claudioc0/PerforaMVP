from datetime import datetime, date

from sqlalchemy import event

from app.extensions import db
from app.utils.dates import day_bounds


class Meal(db.Model):
    """Representa uma refeição analisada e registrada no histórico do usuário."""

    __tablename__ = "meals"

    id = db.Column(db.Integer, primary_key=True)

    # Nome/descrição do prato identificado pela IA (ex: "Arroz, feijão e frango grelhado")
    description = db.Column(db.String(255), nullable=False)

    calories = db.Column(db.Float, nullable=False, default=0)
    protein_g = db.Column(db.Float, nullable=False, default=0)
    carbs_g = db.Column(db.Float, nullable=False, default=0)
    fat_g = db.Column(db.Float, nullable=False, default=0)

    # Quantidade em gramas que o usuário confirmou (a análise da IA é sempre por 100g)
    quantity_g = db.Column(db.Float, nullable=False, default=100)

    # Detalhamento por alimento (lista de {description, calories, protein_g, carbs_g, fat_g,
    # quantity_g}). Nulo para refeições antigas ou registradas manualmente sem detalhamento —
    # nesse caso os campos acima (description/calories/...) são a própria refeição, como um
    # único item implícito.
    items = db.Column(db.JSON, nullable=True)

    # Guardamos a origem (foto ou texto) e um nível de confiança opcional da IA
    source_type = db.Column(db.String(10), nullable=False, default="image")  # image | text
    confidence = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # NOVA COLUNA: Chave estrangeira que obriga toda refeição a ter um dono (usuário)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    # Toda leitura de refeições filtra por user_id E created_at juntos
    # (query_by_date + get_meals_for_date) — sem índice, cada carregamento do
    # Dashboard varre a tabela inteira. Composto, não dois índices separados,
    # porque as duas colunas são sempre usadas juntas nessa consulta.
    __table_args__ = (
        db.Index("ix_meals_user_id_created_at", "user_id", "created_at"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "calories": self.calories,
            "protein_g": self.protein_g,
            "carbs_g": self.carbs_g,
            "fat_g": self.fat_g,
            "quantity_g": self.quantity_g,
            "items": self.items or [],
            "source_type": self.source_type,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
            "user_id": self.user_id, # Retornando o ID do dono da refeição
        }

    @staticmethod
    def query_by_date(target_date: date, user_id: int):
        """Retorna todas as refeições de um usuário registradas no dia informado.

        O escopo por user_id é obrigatório aqui, não deixado a cargo de quem
        chama — uma versão anterior devolvia a query sem esse filtro e exigia
        que cada chamador lembrasse de encadear `.filter_by(user_id=...)`; um
        chamador novo que esquecesse devolveria refeições de todos os usuários.

        A ordenação é por id (ordem de inserção) e não por created_at: a hora
        gravada vem do relógio UTC do servidor, então perto da virada do dia em
        UTC ela sai fora de ordem em relação ao horário local. Só a parte da
        data de created_at é confiável.
        """
        start, end = day_bounds(target_date)

        return Meal.query.filter(
            Meal.user_id == user_id,
            Meal.created_at.between(start, end),
        ).order_by(Meal.id.asc())


@event.listens_for(Meal, "before_insert")
@event.listens_for(Meal, "before_update")
def _recompute_aggregate_from_items(mapper, connection, target: Meal) -> None:
    """Quando há detalhamento por item, os totais (calories/protein_g/...)
    são SEMPRE derivados da soma dos itens, nunca do que o chamador passou.

    Antes esse invariante (total == soma dos itens) dependia inteiramente de
    disciplina no service que constrói o Meal (MealService._aggregate_from_items)
    — qualquer outro caminho de escrita que esquecesse de recalcular os
    totais salvaria uma refeição inconsistente sem nenhum aviso. Isso roda no
    próprio flush, então vale pra qualquer forma de gravar um Meal com items,
    não só a usada hoje.
    """
    items = target.items
    if not items:
        return

    target.description = ", ".join(str(item.get("description", "Item")) for item in items)
    target.calories = sum(float(item.get("calories", 0)) for item in items)
    target.protein_g = sum(float(item.get("protein_g", 0)) for item in items)
    target.carbs_g = sum(float(item.get("carbs_g", 0)) for item in items)
    target.fat_g = sum(float(item.get("fat_g", 0)) for item in items)
    target.quantity_g = sum(float(item.get("quantity_g", 0)) for item in items)