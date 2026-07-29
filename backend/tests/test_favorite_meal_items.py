"""Regressão/feature: FavoriteMeal.items (prato composto reutilizável).

Mesmo invariante de Meal (totais SEMPRE derivados da soma dos itens, nunca do
que o chamador passou) — mas, diferente de Meal, a `description` de um
FavoriteMeal NÃO é recalculada a partir dos itens: é o nome que o usuário deu
ao combo (ex: "Marmita de terça"), não uma lista de alimentos concatenada.
"""
from app.extensions import db
from app.models import FavoriteMeal, User


def _make_user(email):
    user = User(name="Teste Combo", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestFavoriteMealComItemsRecalculaTotais:
    def test_totais_sao_derivados_da_soma_dos_itens_no_insert(self, app):
        with app.app_context():
            user = _make_user("combo-insert@example.com")
            favorite = FavoriteMeal(
                user_id=user.id,
                description="Marmita de terça",
                # Valores propositalmente errados — o listener deve ignorá-los.
                calories=1, protein_g=1, carbs_g=1, fat_g=1,
                items=[
                    {"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3, "quantity_g": 100},
                    {"description": "Frango grelhado", "calories": 165, "protein_g": 31, "carbs_g": 0, "fat_g": 3.6, "quantity_g": 150},
                ],
            )
            db.session.add(favorite)
            db.session.commit()

            assert favorite.calories == 295  # 130 + 165
            assert favorite.protein_g == 33.7  # 2.7 + 31
            assert favorite.carbs_g == 28
            assert favorite.fat_g == 3.9

    def test_description_do_combo_nao_e_sobrescrita_pelos_itens(self, app):
        """Diferente de Meal — o nome do combo é intencional, não derivado."""
        with app.app_context():
            user = _make_user("combo-nome@example.com")
            favorite = FavoriteMeal(
                user_id=user.id,
                description="Marmita de terça",
                calories=0, protein_g=0, carbs_g=0, fat_g=0,
                items=[{"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3}],
            )
            db.session.add(favorite)
            db.session.commit()

            assert favorite.description == "Marmita de terça"

    def test_totais_sao_recalculados_no_update(self, app):
        with app.app_context():
            user = _make_user("combo-update@example.com")
            favorite = FavoriteMeal(
                user_id=user.id, description="Combo",
                calories=100, protein_g=10, carbs_g=10, fat_g=10,
            )
            db.session.add(favorite)
            db.session.commit()

            favorite.items = [{"description": "Novo item", "calories": 500, "protein_g": 40, "carbs_g": 50, "fat_g": 20}]
            db.session.commit()

            assert favorite.calories == 500
            assert favorite.protein_g == 40

    def test_favorito_sem_items_continua_funcionando_como_antes(self, app):
        """Regressão: favoritos simples (sem combo) não devem ser afetados."""
        with app.app_context():
            user = _make_user("combo-flat@example.com")
            favorite = FavoriteMeal(
                user_id=user.id, description="Banana",
                calories=89, protein_g=1.1, carbs_g=23, fat_g=0.3,
            )
            db.session.add(favorite)
            db.session.commit()

            assert favorite.calories == 89
            assert favorite.items is None
            assert favorite.to_dict()["items"] == []


class TestRotaDeFavoritarAceitaItems:
    def test_post_com_items_deriva_macros_no_backend(self, client, auth_headers):
        payload = {
            "description": "Marmita de terça",
            "items": [
                {"description": "Arroz", "calories": 130, "protein_g": 2.7, "carbs_g": 28, "fat_g": 0.3},
                {"description": "Frango grelhado", "calories": 165, "protein_g": 31, "carbs_g": 0, "fat_g": 3.6},
            ],
        }
        response = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert response.status_code == 201

        listing = client.get("/api/meals/favorites", headers=auth_headers)
        combo = next(f for f in listing.get_json()["items"] if f["description"] == "Marmita de terça")
        assert combo["calories"] == 295
        assert len(combo["items"]) == 2

    def test_post_sem_items_continua_funcionando_como_antes(self, client, auth_headers):
        payload = {"description": "Banana", "calories": 89, "protein_g": 1.1, "carbs_g": 23, "fat_g": 0.3}
        response = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert response.status_code == 201

        listing = client.get("/api/meals/favorites", headers=auth_headers)
        simple = next(f for f in listing.get_json()["items"] if f["description"] == "Banana")
        assert simple["calories"] == 89
        assert simple["items"] == []
