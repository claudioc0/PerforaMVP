"""Helpers de data compartilhados entre os serviços.

O Perfora é organizado por dia de calendário **do usuário**: o aparelho informa a
que dia um registro pertence (string YYYY-MM-DD, montada no fuso local) e o
servidor guarda tudo dentro desse dia.

Sem isso, qualquer registro feito à noite cairia no dia seguinte: às 22h no
horário de Brasília (UTC-3) o relógio UTC já está no dia seguinte, então uma
refeição do jantar era contabilizada no orçamento calórico de amanhã.

Estas funções existem para que refeição e água usem exatamente a mesma definição
de "dia" — quando cada serviço calculava isso por conta própria, os dois
discordavam justamente no fim da noite.
"""

from datetime import date, datetime
from typing import Optional, Tuple


def parse_date_str(date_str: Optional[str]) -> date:
    """Converte 'YYYY-MM-DD' em date.

    Cai para a data atual do servidor se a string estiver ausente ou inválida —
    é um palpite, já que sem o fuso do aparelho o servidor não tem como saber
    em que dia o usuário está.
    """
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass
    return datetime.utcnow().date()


def day_bounds(target_date: date) -> Tuple[datetime, datetime]:
    """Primeiro e último instante do dia, para filtros com BETWEEN."""
    return (
        datetime.combine(target_date, datetime.min.time()),
        datetime.combine(target_date, datetime.max.time()),
    )


def timestamp_within_date(target_date: date) -> datetime:
    """Monta um timestamp que cai garantidamente dentro de target_date.

    A parte da data vem do dia que o usuário declarou; a hora vem do relógio do
    servidor, apenas para dar alguma granularidade. Só a data é confiável — por
    isso as listagens ordenam por id (ordem de inserção), não por este horário.
    """
    return datetime.combine(target_date, datetime.utcnow().time())
