"""`delete_meal` e `remove_favorite` (`meals_routes.py`) não tinham nenhum teste
— só `save_meal`/`update_meal`/`add_favorite` estavam cobertos em outros
arquivos. Cobre o caminho feliz e o isolamento por dono (404, não 403/500,
mesmo padrão de IDOR usado no resto da suíte)."""

def _save_meal(auth_client, description="Arroz com Frango"):
    response = auth_client.post(
        "/api/meals/save",
        json={
            "description": description,
            "calories": 500,
            "protein_g": 40,
            "carbs_g": 50,
            "fat_g": 10,
        },
    )
    assert response.status_code == 201
    return response.get_json()["id"]


def _add_favorite(auth_client, description="Favorito Teste"):
    response = auth_client.post(
        "/api/meals/favorites",
        json={"description": description, "calories": 400, "protein_g": 30, "carbs_g": 40, "fat_g": 10},
    )
    assert response.status_code == 201
    favorites = auth_client.get("/api/meals/favorites").get_json()["items"]
    return next(f["id"] for f in favorites if f["description"] == description)


class TestDeleteMeal:
    def test_apaga_refeicao_do_dono(self, auth_client):
        meal_id = _save_meal(auth_client)
        response = auth_client.delete(f"/api/meals/{meal_id}")
        assert response.status_code == 200

        today = auth_client.get("/api/meals/today").get_json()
        assert all(m["id"] != meal_id for m in today.get("meals", []))

    def test_refeicao_inexistente_devolve_404(self, auth_client):
        response = auth_client.delete("/api/meals/99999")
        assert response.status_code == 404

    def test_refeicao_de_outro_usuario_devolve_404_e_nao_apaga(self, auth_client, second_auth_client):
        meal_id = _save_meal(second_auth_client, description="Refeição Privada")
        response = auth_client.delete(f"/api/meals/{meal_id}")
        assert response.status_code == 404

        today = second_auth_client.get("/api/meals/today").get_json()
        assert any(m["id"] == meal_id for m in today.get("meals", []))


class TestRemoveFavorite:
    def test_remove_favorito_do_dono(self, auth_client):
        fav_id = _add_favorite(auth_client)
        response = auth_client.delete(f"/api/meals/favorites/{fav_id}")
        assert response.status_code == 200

        favorites = auth_client.get("/api/meals/favorites").get_json()["items"]
        assert all(f["id"] != fav_id for f in favorites)

    def test_favorito_inexistente_devolve_404(self, auth_client):
        response = auth_client.delete("/api/meals/favorites/99999")
        assert response.status_code == 404

    def test_favorito_de_outro_usuario_devolve_404_e_nao_remove(self, auth_client, second_auth_client):
        fav_id = _add_favorite(second_auth_client, description="Favorito Privado")
        response = auth_client.delete(f"/api/meals/favorites/{fav_id}")
        assert response.status_code == 404

        favorites = second_auth_client.get("/api/meals/favorites").get_json()["items"]
        assert any(f["id"] == fav_id for f in favorites)
