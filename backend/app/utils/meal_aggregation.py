"""Soma de macros a partir de uma lista de itens — compartilhado entre os
listeners de `Meal` e `FavoriteMeal`, pra não duplicar a mesma regra
(totais SEMPRE derivados da soma dos itens, nunca do que o chamador passou)
em dois arquivos de model diferentes.
"""


def compute_macro_totals_from_items(items: list) -> dict:
    """Cada item é {description, calories, protein_g, carbs_g, fat_g, quantity_g}.
    Devolve só os totais numéricos — quem decide o que fazer com a
    `description` da entidade é o listener de cada model (Meal deriva a dela
    a partir dos itens; FavoriteMeal preserva o nome que o usuário deu ao
    combo, então não usa esse retorno pra description).
    """
    return {
        "calories": sum(float(item.get("calories", 0)) for item in items),
        "protein_g": sum(float(item.get("protein_g", 0)) for item in items),
        "carbs_g": sum(float(item.get("carbs_g", 0)) for item in items),
        "fat_g": sum(float(item.get("fat_g", 0)) for item in items),
        "quantity_g": sum(float(item.get("quantity_g", 0)) for item in items),
    }
