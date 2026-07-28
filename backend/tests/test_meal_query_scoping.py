"""Regressão: Meal.query_by_date não pode devolver refeições de outro usuário.

Antes, query_by_date(target_date) devolvia a Query SEM filtro de user_id — o
escopo por usuário era responsabilidade de quem chamava, encadeando
`.filter_by(user_id=...)` por conta própria. Um chamador novo que esquecesse
esse encadeamento devolveria silenciosamente refeições de todo mundo. Agora
user_id é parâmetro obrigatório da própria função, embutido no filtro base —
não dá pra esquecer.
"""
from datetime import datetime

from app.extensions import db
from app.models import Meal, User


def _make_user(email):
    user = User(name="Teste Scoping", email=email)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


class TestQueryByDateEscopadaPorUsuario:
    def test_nao_devolve_refeicao_de_outro_usuario_no_mesmo_dia(self, app):
        with app.app_context():
            user_a = _make_user("scoping-a@example.com")
            user_b = _make_user("scoping-b@example.com")
            today = datetime.utcnow()

            meal_a = Meal(
                user_id=user_a.id, description="Refeição A",
                calories=100, protein_g=1, carbs_g=1, fat_g=1, created_at=today,
            )
            meal_b = Meal(
                user_id=user_b.id, description="Refeição B",
                calories=200, protein_g=2, carbs_g=2, fat_g=2, created_at=today,
            )
            db.session.add_all([meal_a, meal_b])
            db.session.commit()

            results = Meal.query_by_date(today.date(), user_id=user_a.id).all()

            assert len(results) == 1
            assert results[0].id == meal_a.id
