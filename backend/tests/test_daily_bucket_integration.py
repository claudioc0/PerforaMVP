"""Garante que refeição e água caem no MESMO dia declarado pelo aparelho.

Este era o bug: a refeição era guardada no dia que o app mandava, mas a água era
carimbada com o relógio UTC do servidor. Às 22h no horário de Brasília os dois
discordavam — e ao corrigir só um dos lados, o outro quebrava.

Os testes usam uma data fixa no passado, então independem de que horas são quando
a suíte roda.
"""

from datetime import datetime, timedelta

# Um dia claramente diferente de hoje. É essencial que NÃO seja a data atual: o bug
# da água era justamente o servidor usar o próprio "hoje" em vez do dia informado —
# com uma data de hoje o teste passaria por coincidência, mesmo com o bug presente.
_BASE = datetime.utcnow().date() - timedelta(days=30)
DIA = _BASE.strftime("%Y-%m-%d")
DIA_SEGUINTE = (_BASE + timedelta(days=1)).strftime("%Y-%m-%d")


def _resumo_do_dia(client, auth_headers, dia):
    response = client.get(f"/api/meals/today?date={dia}", headers=auth_headers)
    assert response.status_code == 200
    return response.get_json()


class TestRefeicaoFicaNoDiaDeclarado:
    def test_refeicao_aparece_no_dia_informado(self, client, auth_headers):
        payload = {
            "date": DIA,
            "description": "Jantar",
            "calories": 600,
            "protein_g": 40,
            "carbs_g": 50,
            "fat_g": 20,
            "quantity_g": 400,
        }
        response = client.post("/api/meals/save", json=payload, headers=auth_headers)
        assert response.status_code == 201

        resumo = _resumo_do_dia(client, auth_headers, DIA)
        assert resumo["meals_count"] == 1
        assert resumo["total_calories"] == 600

    def test_refeicao_nao_vaza_para_o_dia_seguinte(self, client, auth_headers):
        payload = {
            "date": DIA,
            "description": "Jantar",
            "calories": 600,
            "protein_g": 40,
            "carbs_g": 50,
            "fat_g": 20,
            "quantity_g": 400,
        }
        assert client.post("/api/meals/save", json=payload, headers=auth_headers).status_code == 201

        # É exatamente isso que acontecia antes: o jantar era contabilizado amanhã
        resumo = _resumo_do_dia(client, auth_headers, DIA_SEGUINTE)
        assert resumo["meals_count"] == 0
        assert resumo["total_calories"] == 0


class TestAguaFicaNoDiaDeclarado:
    def test_agua_aparece_no_dia_informado(self, client, auth_headers):
        response = client.post(
            "/api/user/water/add",
            json={"amount": 500, "date": DIA},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.get_json()["total"] == 500

        resumo = _resumo_do_dia(client, auth_headers, DIA)
        assert resumo["total_water_ml"] == 500

    def test_agua_nao_vaza_para_o_dia_seguinte(self, client, auth_headers):
        client.post(
            "/api/user/water/add",
            json={"amount": 500, "date": DIA},
            headers=auth_headers,
        )

        resumo = _resumo_do_dia(client, auth_headers, DIA_SEGUINTE)
        assert resumo["total_water_ml"] == 0

    def test_total_retornado_bate_com_o_do_resumo(self, client, auth_headers):
        """O número que aparece na hora de adicionar tem que ser o mesmo do Dashboard.

        Antes, adicionar água somava pelo dia UTC do servidor e o Dashboard lia
        pelo dia local do usuário — os dois valores divergiam à noite.
        """
        client.post(
            "/api/user/water/add", json={"amount": 250, "date": DIA}, headers=auth_headers
        )
        resposta = client.post(
            "/api/user/water/add", json={"amount": 500, "date": DIA}, headers=auth_headers
        )

        total_ao_adicionar = resposta.get_json()["total"]
        total_no_resumo = _resumo_do_dia(client, auth_headers, DIA)["total_water_ml"]

        assert total_ao_adicionar == 750
        assert total_ao_adicionar == total_no_resumo


class TestRefeicaoEAguaConcordam:
    def test_ambos_caem_no_mesmo_dia(self, client, auth_headers):
        """O invariante que amarra os dois lados da correção."""
        client.post(
            "/api/meals/save",
            json={"date": DIA, "description": "Jantar", "calories": 600},
            headers=auth_headers,
        )
        client.post(
            "/api/user/water/add", json={"amount": 500, "date": DIA}, headers=auth_headers
        )

        no_dia = _resumo_do_dia(client, auth_headers, DIA)
        assert no_dia["meals_count"] == 1 and no_dia["total_water_ml"] == 500

        no_dia_seguinte = _resumo_do_dia(client, auth_headers, DIA_SEGUINTE)
        assert no_dia_seguinte["meals_count"] == 0 and no_dia_seguinte["total_water_ml"] == 0
