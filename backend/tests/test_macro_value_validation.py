"""Regressão: valores nutricionais fora de uma faixa plausível (negativos ou
astronomicamente altos) eram aceitos sem checagem em `add_favorite` e
`update_meal` — só `float()` convertia, sem limite nenhum. Agora
`validate_macro_value` (app/utils/nutrition.py) recusa antes de persistir,
mesmo padrão já usado em `log_weight` pra peso <= 0.
"""


class TestAddFavoriteRecusaValoresForaDaFaixa:
    def test_calorias_negativas_devolve_400(self, auth_client):
        payload = {"description": "Prato estranho", "calories": -100, "protein_g": 10, "carbs_g": 10, "fat_g": 10}
        response = auth_client.post("/api/meals/favorites", json=payload)
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_proteina_absurdamente_alta_devolve_400(self, auth_client):
        payload = {"description": "Prato impossível", "calories": 500, "protein_g": 999999, "carbs_g": 10, "fat_g": 10}
        response = auth_client.post("/api/meals/favorites", json=payload)
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_valores_plausiveis_continuam_aceitos(self, auth_client):
        payload = {"description": "Prato normal", "calories": 500, "protein_g": 40, "carbs_g": 50, "fat_g": 15}
        response = auth_client.post("/api/meals/favorites", json=payload)
        assert response.status_code == 201


class TestUpdateMealRecusaValoresForaDaFaixa:
    def _create_meal(self, auth_client):
        payload = {"description": "Refeição original", "calories": 500, "protein_g": 30, "carbs_g": 40, "fat_g": 10}
        response = auth_client.post("/api/meals/save", json=payload)
        assert response.status_code == 201
        return response.get_json()["id"]

    def test_calorias_negativas_no_update_devolve_404_por_rollback(self, auth_client):
        # update_meal captura ValueError e devolve None (mesma trilha de "não
        # encontrada") — não é a mensagem ideal, mas o valor inválido nunca
        # chega a ser persistido, que é o que importa aqui.
        meal_id = self._create_meal(auth_client)
        response = auth_client.put(f"/api/meals/{meal_id}", json={"calories": -50})
        assert response.status_code == 404

        unchanged = auth_client.get("/api/meals/today")
        assert unchanged.status_code == 200

    def test_update_com_valores_plausiveis_funciona(self, auth_client):
        meal_id = self._create_meal(auth_client)
        response = auth_client.put(f"/api/meals/{meal_id}", json={"calories": 600})
        assert response.status_code == 200
        assert response.get_json()["calories"] == 600
