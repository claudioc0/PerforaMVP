"""Regressão: o total de uma refeição com detalhamento por item precisa
sempre bater com a soma dos itens.

Antes esse invariante dependia inteiramente de disciplina no service que
constrói o Meal (MealService._aggregate_from_items) — nada no modelo ou no
banco impedia gravar um Meal com items=[...] e totais que não batem com a
soma deles. Agora um listener de before_insert/before_update recalcula os
totais a partir de items sempre que items está presente, não importa quem
grava a linha.
"""
from app.extensions import db
from app.models import Meal, User


def _make_user(email):
    user = User(name="Teste Invariante", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestTotalDaRefeicaoSempreBateComSomaDosItens:
    def test_totais_errados_passados_no_construtor_sao_sobrescritos(self, app):
        with app.app_context():
            user = _make_user("aggregate-a@example.com")
            items = [
                {"description": "Arroz", "calories": 200, "protein_g": 4, "carbs_g": 45, "fat_g": 1, "quantity_g": 100},
                {"description": "Feijão", "calories": 150, "protein_g": 9, "carbs_g": 25, "fat_g": 1, "quantity_g": 100},
            ]
            # Valores propositalmente ERRADOS (não batem com a soma dos items acima) —
            # simula um caller que não usou MealService._aggregate_from_items.
            meal = Meal(
                description="Descrição errada",
                calories=99999, protein_g=99999, carbs_g=99999, fat_g=99999, quantity_g=99999,
                items=items,
                source_type="manual",
                user_id=user.id,
            )
            db.session.add(meal)
            db.session.commit()

            assert meal.calories == 350
            assert meal.protein_g == 13
            assert meal.carbs_g == 70
            assert meal.fat_g == 2
            assert meal.quantity_g == 200
            assert meal.description == "Arroz, Feijão"

    def test_recalcula_tambem_no_update(self, app):
        with app.app_context():
            user = _make_user("aggregate-b@example.com")
            meal = Meal(
                description="Arroz",
                calories=200, protein_g=4, carbs_g=45, fat_g=1, quantity_g=100,
                items=[{"description": "Arroz", "calories": 200, "protein_g": 4, "carbs_g": 45, "fat_g": 1, "quantity_g": 100}],
                source_type="manual",
                user_id=user.id,
            )
            db.session.add(meal)
            db.session.commit()

            # Atualiza os items sem tocar nos campos agregados — o listener de
            # before_update precisa recalcular mesmo assim.
            meal.items = [
                {"description": "Arroz", "calories": 200, "protein_g": 4, "carbs_g": 45, "fat_g": 1, "quantity_g": 100},
                {"description": "Ovo", "calories": 70, "protein_g": 6, "carbs_g": 1, "fat_g": 5, "quantity_g": 50},
            ]
            db.session.commit()

            assert meal.calories == 270
            assert meal.protein_g == 10
            assert meal.description == "Arroz, Ovo"

    def test_sem_items_preserva_os_campos_soltos(self, app):
        """Refeição manual sem detalhamento por item (items=None) continua
        usando os campos agregados fornecidos diretamente — o invariante só
        se aplica quando items está presente."""
        with app.app_context():
            user = _make_user("aggregate-c@example.com")
            meal = Meal(
                description="Refeição manual sem itens",
                calories=500, protein_g=20, carbs_g=60, fat_g=15, quantity_g=300,
                items=None,
                source_type="manual",
                user_id=user.id,
            )
            db.session.add(meal)
            db.session.commit()

            assert meal.calories == 500
            assert meal.protein_g == 20
            assert meal.description == "Refeição manual sem itens"
