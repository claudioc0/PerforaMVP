"""Regressão do bug de fuso horário: refeições da noite caindo no dia seguinte.

O app guarda cada registro no dia de calendário que o aparelho do usuário
declara. O invariante que sustenta isso é simples e é o que estes testes travam:

    um registro carimbado para o dia D sempre é encontrado por uma consulta do dia D

Antes da correção, a água era carimbada com o relógio UTC do servidor enquanto a
consulta usava o dia local do usuário — às 22h no horário de Brasília os dois
discordavam e o registro sumia do dia.
"""

from datetime import date, datetime, time, timedelta

from app.utils.dates import day_bounds, parse_date_str, timestamp_within_date


class TestParseDateStr:
    def test_converte_string_valida(self):
        assert parse_date_str("2026-07-27") == date(2026, 7, 27)

    def test_usa_fallback_quando_ausente(self):
        assert parse_date_str(None) == datetime.utcnow().date()

    def test_usa_fallback_quando_formato_invalido(self):
        # Não deve estourar exceção: cai no dia atual do servidor
        assert parse_date_str("27/07/2026") == datetime.utcnow().date()
        assert parse_date_str("") == datetime.utcnow().date()


class TestDayBounds:
    def test_cobre_o_dia_inteiro(self):
        start, end = day_bounds(date(2026, 7, 27))

        assert start == datetime(2026, 7, 27, 0, 0, 0)
        assert start.date() == end.date() == date(2026, 7, 27)
        # O fim precisa ser o último instante do dia, senão registros perto da
        # meia-noite escapam do BETWEEN
        assert end.hour == 23 and end.minute == 59 and end.second == 59

    def test_nao_invade_o_dia_seguinte(self):
        _, end = day_bounds(date(2026, 7, 27))
        next_day_start, _ = day_bounds(date(2026, 7, 28))

        assert end < next_day_start


class TestTimestampWithinDate:
    def test_timestamp_cai_no_dia_declarado(self):
        target = date(2026, 7, 27)
        assert timestamp_within_date(target).date() == target

    def test_timestamp_cai_no_dia_declarado_mesmo_sendo_dia_antigo(self):
        # Registro retroativo: o usuário lança uma refeição de uma semana atrás
        target = datetime.utcnow().date() - timedelta(days=7)
        assert timestamp_within_date(target).date() == target


class TestInvariantePrincipal:
    """O que realmente garante que o registro não some do dia."""

    def test_qualquer_hora_do_relogio_do_servidor_cai_dentro_do_dia(self):
        # timestamp_within_date usa a hora atual do servidor (UTC). Independente
        # de que hora seja lá — inclusive na virada do dia em UTC, que é quando o
        # bug aparecia — o registro precisa cair dentro do dia declarado.
        target = date(2026, 7, 27)
        start, end = day_bounds(target)

        for hour in range(24):
            for minute in (0, 59):
                stamped = datetime.combine(target, time(hour, minute))
                assert start <= stamped <= end, (
                    f"registro das {hour:02d}:{minute:02d} caiu fora do dia {target}"
                )

    def test_cenario_do_jantar_no_horario_de_brasilia(self):
        # 27/07 às 22h em Brasília (UTC-3) já é 28/07 às 01h em UTC.
        # O aparelho manda o dia LOCAL ("2026-07-27"); o servidor pode estar em
        # qualquer hora UTC. O registro tem que ficar no dia 27, não no 28.
        dia_local_do_usuario = "2026-07-27"
        hora_utc_do_servidor = time(1, 0)  # 01h UTC = 22h em Brasília

        target = parse_date_str(dia_local_do_usuario)
        stamped = datetime.combine(target, hora_utc_do_servidor)

        start, end = day_bounds(target)
        assert start <= stamped <= end
        assert stamped.date() == date(2026, 7, 27)

        # E não pode ser encontrado pela consulta do dia seguinte
        next_start, next_end = day_bounds(date(2026, 7, 28))
        assert not (next_start <= stamped <= next_end)
