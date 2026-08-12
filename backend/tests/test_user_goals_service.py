"""Cobertura de `UserService.update_user_goals` e `calculate_and_save_smart_goals`
(`app/services/user_service.py`), que estava em 48% — a rota de água (que usa
o mesmo service) já tinha testes em outros arquivos, mas o CRUD de metas
manuais e o cálculo automático (Mifflin-St Jeor) não tinham nenhum.
"""

import pytest


class TestGetUserGoals:
    def test_sem_metas_cadastradas_devolve_objeto_vazio(self, auth_client):
        response = auth_client.get("/api/user/goals")
        assert response.status_code == 200
        assert response.get_json() == {}

    def test_com_metas_cadastradas_devolve_os_valores(self, auth_client):
        auth_client.put("/api/user/goals", json={"goal_calories": 2200, "goal_type": "gain"})
        response = auth_client.get("/api/user/goals")
        assert response.status_code == 200
        assert response.get_json()["goal_calories"] == 2200
        assert response.get_json()["goal_type"] == "gain"


class TestUpdateUserGoals:
    def test_primeira_atualizacao_cria_o_registro_de_metas(self, auth_client):
        response = auth_client.put(
            "/api/user/goals",
            json={
                "goal_calories": 2500,
                "goal_protein_g": 180,
                "goal_carbs_g": 250,
                "goal_fat_g": 70,
                "goal_type": "gain",
            },
        )
        assert response.status_code == 200
        goals = response.get_json()["goals"]
        assert goals["goal_calories"] == 2500
        assert goals["goal_protein_g"] == 180
        assert goals["goal_type"] == "gain"

    def test_atualizacao_parcial_preserva_campos_nao_enviados(self, auth_client):
        auth_client.put(
            "/api/user/goals",
            json={
                "goal_calories": 2000,
                "goal_protein_g": 150,
                "goal_carbs_g": 200,
                "goal_fat_g": 60,
                "goal_type": "maintain",
            },
        )

        response = auth_client.put("/api/user/goals", json={"goal_calories": 1800})
        assert response.status_code == 200
        goals = response.get_json()["goals"]
        assert goals["goal_calories"] == 1800
        # Campos não enviados desta vez continuam com o valor da chamada anterior.
        assert goals["goal_protein_g"] == 150
        assert goals["goal_type"] == "maintain"

    def test_body_vazio_nao_muda_valores_existentes(self, auth_client):
        auth_client.put("/api/user/goals", json={"goal_calories": 2100})
        response = auth_client.put("/api/user/goals", json={})
        assert response.status_code == 200
        assert response.get_json()["goals"]["goal_calories"] == 2100


class TestCalculateSmartGoals:
    VALID_PHYSICAL_DATA = {
        "weight": 80,
        "height": 180,
        "age": 30,
        "gender": "M",
        "activity_level": 1.55,
        "goal": "lose",
    }

    def test_dados_incompletos_devolve_400(self, auth_client):
        response = auth_client.post(
            "/api/user/calculate-goals", json={"weight": 80, "height": 180}
        )
        assert response.status_code == 400
        assert "incompletos" in response.get_json()["error"]

    def test_calculo_para_homem_objetivo_perder_peso(self, auth_client):
        response = auth_client.post(
            "/api/user/calculate-goals", json=self.VALID_PHYSICAL_DATA
        )
        assert response.status_code == 200
        goals = response.get_json()["goals"]

        # TMB (Mifflin-St Jeor, homem) = 10*peso + 6.25*altura - 5*idade + 5
        tmb = 10 * 80 + 6.25 * 180 - 5 * 30 + 5
        tdee = tmb * 1.55
        assert goals["goal_calories"] == round(tdee - 500)
        assert goals["goal_type"] == "lose"
        # Proteína: 2g/kg
        assert goals["goal_protein_g"] == round(2.0 * 80)

    def test_calculo_para_mulher_objetivo_ganhar_peso(self, auth_client):
        data = {**self.VALID_PHYSICAL_DATA, "gender": "F", "goal": "gain"}
        response = auth_client.post("/api/user/calculate-goals", json=data)
        assert response.status_code == 200
        goals = response.get_json()["goals"]

        # TMB (mulher) = 10*80 + 6.25*180 - 5*30 - 161 = 1701.5
        tdee = (10 * 80 + 6.25 * 180 - 5 * 30 - 161) * 1.55
        assert goals["goal_calories"] == round(tdee + 500)
        assert goals["goal_type"] == "gain"

    def test_calculo_objetivo_manter_peso_nao_soma_nem_subtrai(self, auth_client):
        data = {**self.VALID_PHYSICAL_DATA, "goal": "maintain"}
        response = auth_client.post("/api/user/calculate-goals", json=data)
        assert response.status_code == 200
        goals = response.get_json()["goals"]

        tdee = (10 * 80 + 6.25 * 180 - 5 * 30 + 5) * 1.55
        assert goals["goal_calories"] == round(tdee)

    def test_macros_batem_com_o_total_calorico(self, auth_client):
        response = auth_client.post(
            "/api/user/calculate-goals", json=self.VALID_PHYSICAL_DATA
        )
        goals = response.get_json()["goals"]

        recomputed_calories = (
            goals["goal_protein_g"] * 4 + goals["goal_carbs_g"] * 4 + goals["goal_fat_g"] * 9
        )
        # Arredondamento de cada macro isoladamente pode gerar uma folga pequena
        # em relação ao total calórico — não deve nunca divergir mais que ~1%.
        assert abs(recomputed_calories - goals["goal_calories"]) <= goals["goal_calories"] * 0.01

    def test_gordura_e_exatamente_25_por_cento_do_total_calorico(self, auth_client):
        # O teste acima ("macros batem com o total calórico") não pega bug
        # nenhum na fórmula da gordura: carboidrato é definido como "o que
        # sobrar" (calorie_goal - proteína - gordura), então a soma dos três
        # sempre fecha em calorie_goal por construção algébrica, não importa
        # o que a fórmula da gordura calcule — um mutation test provou isso
        # na prática (fat_calories = calorie_goal * 0.25 virou / 0.25 e
        # * 1.25 sem que aquele teste notasse). Este aqui trava o valor
        # absoluto da gordura, não uma relação que sempre se anula sozinha.
        response = auth_client.post(
            "/api/user/calculate-goals", json=self.VALID_PHYSICAL_DATA
        )
        goals = response.get_json()["goals"]

        tmb = 10 * 80 + 6.25 * 180 - 5 * 30 + 5
        tdee = tmb * 1.55
        calorie_goal = tdee - 500  # goal="lose" nos dados de VALID_PHYSICAL_DATA
        expected_fat_g = round((calorie_goal * 0.25) / 9)

        assert goals["goal_fat_g"] == expected_fat_g

    def test_calculo_persiste_as_metas_via_get(self, auth_client):
        auth_client.post("/api/user/calculate-goals", json=self.VALID_PHYSICAL_DATA)
        response = auth_client.get("/api/user/goals")
        assert response.get_json()["goal_type"] == "lose"
