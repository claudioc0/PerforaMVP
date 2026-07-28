"""Regressão: favoritos duplicados sem limite.

Antes, nada impedia favoritar a mesma descrição várias vezes — a lista
crescia com entradas idênticas sem controle nenhum. Agora
uq_favorite_meals_user_description barra a duplicata com um IntegrityError
real (não mockado).
"""
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import FavoriteMeal, User


def _make_user(email):
    user = User(name="Teste Favorito", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestUnicidadeDeFavoritoPorDescricao:
    def test_segundo_favorito_com_mesma_descricao_levanta_integrity_error(self, app):
        with app.app_context():
            user = _make_user("fav-unique-a@example.com")

            db.session.add(FavoriteMeal(
                user_id=user.id, description="Arroz com feijão",
                calories=400, protein_g=10, carbs_g=60, fat_g=5,
            ))
            db.session.commit()

            db.session.add(FavoriteMeal(
                user_id=user.id, description="Arroz com feijão",
                calories=420, protein_g=11, carbs_g=61, fat_g=6,
            ))
            try:
                db.session.commit()
                assert False, "esperava IntegrityError por violar uq_favorite_meals_user_description"
            except IntegrityError:
                db.session.rollback()

    def test_descricoes_diferentes_nao_colidem(self, app):
        with app.app_context():
            user = _make_user("fav-unique-b@example.com")

            db.session.add(FavoriteMeal(
                user_id=user.id, description="Arroz com feijão",
                calories=400, protein_g=10, carbs_g=60, fat_g=5,
            ))
            db.session.add(FavoriteMeal(
                user_id=user.id, description="Frango grelhado",
                calories=250, protein_g=30, carbs_g=0, fat_g=8,
            ))
            db.session.commit()

            assert FavoriteMeal.query.filter_by(user_id=user.id).count() == 2

    def test_mesma_descricao_em_usuarios_diferentes_nao_colide(self, app):
        with app.app_context():
            user_a = _make_user("fav-unique-c@example.com")
            user_b = _make_user("fav-unique-d@example.com")

            db.session.add(FavoriteMeal(
                user_id=user_a.id, description="Arroz com feijão",
                calories=400, protein_g=10, carbs_g=60, fat_g=5,
            ))
            db.session.add(FavoriteMeal(
                user_id=user_b.id, description="Arroz com feijão",
                calories=400, protein_g=10, carbs_g=60, fat_g=5,
            ))
            db.session.commit()

            assert FavoriteMeal.query.count() >= 2


class TestRotaDeFavoritarRecusaDuplicata:
    def test_segunda_chamada_com_mesma_descricao_devolve_409(self, client, auth_headers):
        payload = {"description": "Arroz com feijão", "calories": 400, "protein_g": 10, "carbs_g": 60, "fat_g": 5}
        first = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert first.status_code == 201

        second = client.post("/api/meals/favorites", json=payload, headers=auth_headers)
        assert second.status_code == 409
        assert "error" in second.get_json()
