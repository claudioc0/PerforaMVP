"""Faixa sanitária pra valores nutricionais informados manualmente pelo
usuário — compartilhado entre atualização de refeição e criação de
favorito, pra não duplicar os mesmos limites em dois arquivos.

Não é validação nutricional de verdade (não temos como saber se "2000g de
proteína" é implausível pro prato descrito), só um teto contra valores
negativos ou astronomicamente altos que hoje entram direto no banco e
distorcem qualquer soma/gráfico depois (resumo diário, semanal, export).
"""

MAX_CALORIES = 20000
MAX_MACRO_GRAMS = 5000


def validate_macro_value(value: float, field_name: str, max_value: float) -> float:
    if value < 0 or value > max_value:
        raise ValueError(f"{field_name} deve estar entre 0 e {max_value:.0f}.")
    return value
