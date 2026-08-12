"""Cobertura do plano semanal de treino (Segunda a Domingo).

`weekly_plan_service.py` estava com 16% de cobertura antes destes testes —
praticamente só o "path feliz" simples era exercitado indiretamente por outros
testes. Aqui cobrimos a máquina de estados completa: criar plano com escala
padrão e customizada, substituir plano existente, reatribuir um dia manualmente
(inclusive para descanso), apagar, e as validações que devolvem None/404
(divisão inexistente, divisão sem dias, split_day_ids fora da divisão, dia sem
plano).
"""

from app.extensions import db
from app.models import WorkoutSplit, SplitDay, UserGoals


def _seed_split(app, name="Push/Pull/Legs", day_names=("Push", "Pull", "Legs")):
    """Cria uma divisão com N dias, na ordem dada, e devolve (split_id, [split_day_ids])."""
    with app.app_context():
        split = WorkoutSplit(name=name, description="Divisão de teste")
        db.session.add(split)
        db.session.flush()

        day_ids = []
        for order, day_name in enumerate(day_names):
            day = SplitDay(split_id=split.id, name=day_name, order=order)
            db.session.add(day)
            db.session.flush()
            day_ids.append(day.id)

        db.session.commit()
        return split.id, day_ids


def _seed_empty_split(app, name="Divisão Vazia"):
    """Divisão cadastrada mas sem nenhum SplitDay — cenário de dado inconsistente
    que o serviço precisa recusar em vez de gerar um plano quebrado."""
    with app.app_context():
        split = WorkoutSplit(name=name)
        db.session.add(split)
        db.session.commit()
        return split.id


class TestGetWeeklyPlanSemPlano:
    def test_sem_plano_devolve_has_plan_false(self, auth_client):
        response = auth_client.get("/api/workouts/weekly-plan")
        assert response.status_code == 200
        assert response.get_json() == {"has_plan": False}


class TestCreateWeeklyPlanEscalaPadrao:
    def test_escala_padrao_repete_dias_da_divisao_a_partir_de_segunda(self, app, auth_client):
        split_id, day_ids = _seed_split(app)

        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert response.status_code == 201
        body = response.get_json()
        assert body["has_plan"] is True
        assert body["split_id"] == split_id
        assert len(body["days"]) == 7

        # Segunda, Terça, Quarta recebem os 3 dias da divisão na ordem cadastrada;
        # Quinta a Domingo (sem dia correspondente) viram descanso.
        assigned = [d["split_day_id"] for d in body["days"]]
        assert assigned == [day_ids[0], day_ids[1], day_ids[2], None, None, None, None]
        assert body["days"][0]["day_label"] == "Segunda"
        assert body["days"][6]["day_label"] == "Domingo"

    def test_divisao_inexistente_devolve_404(self, auth_client):
        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": 99999})
        assert response.status_code == 404

    def test_divisao_sem_dias_devolve_404(self, app, auth_client):
        split_id = _seed_empty_split(app)
        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert response.status_code == 404


class TestCreateWeeklyPlanEscalaCustomizada:
    def test_split_day_ids_define_a_escala_explicitamente(self, app, auth_client):
        split_id, day_ids = _seed_split(app)
        # Usuário treina Push duas vezes e Legs uma vez, três dias por semana.
        custom_order = [day_ids[0], day_ids[0], day_ids[2]]

        response = auth_client.post(
            "/api/workouts/weekly-plan",
            json={"split_id": split_id, "split_day_ids": custom_order},
        )
        assert response.status_code == 201
        assigned = [d["split_day_id"] for d in response.get_json()["days"]]
        assert assigned == [day_ids[0], day_ids[0], day_ids[2], None, None, None, None]

    def test_split_day_id_de_outra_divisao_devolve_404(self, app, auth_client):
        split_id, _ = _seed_split(app)
        _, other_day_ids = _seed_split(app, name="Outra Divisão", day_names=("Full Body",))

        response = auth_client.post(
            "/api/workouts/weekly-plan",
            json={"split_id": split_id, "split_day_ids": [other_day_ids[0]]},
        )
        assert response.status_code == 404

    def test_lista_vazia_devolve_400_na_validacao_da_rota(self, app, auth_client):
        split_id, _ = _seed_split(app)
        response = auth_client.post(
            "/api/workouts/weekly-plan",
            json={"split_id": split_id, "split_day_ids": []},
        )
        assert response.status_code == 400

    def test_mais_de_sete_dias_devolve_400_na_validacao_da_rota(self, app, auth_client):
        split_id, day_ids = _seed_split(app, day_names=("A",))
        response = auth_client.post(
            "/api/workouts/weekly-plan",
            json={"split_id": split_id, "split_day_ids": [day_ids[0]] * 8},
        )
        assert response.status_code == 400


class TestCreateWeeklyPlanSubstituiExistente:
    def test_criar_de_novo_substitui_o_plano_anterior_em_vez_de_acumular(self, app, auth_client):
        split_id, day_ids = _seed_split(app)
        auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})

        other_split_id, other_day_ids = _seed_split(app, name="Full Body", day_names=("Corpo Inteiro",))
        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": other_split_id})

        assert response.status_code == 201
        body = response.get_json()
        assert body["split_id"] == other_split_id

        get_response = auth_client.get("/api/workouts/weekly-plan")
        assert get_response.get_json()["split_id"] == other_split_id


class TestUpdateWeeklyPlanDay:
    def test_reatribui_um_dia_para_outro_dia_da_mesma_divisao(self, app, auth_client):
        split_id, day_ids = _seed_split(app)
        auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})

        response = auth_client.put(
            "/api/workouts/weekly-plan/days/3", json={"split_day_id": day_ids[0]}
        )
        assert response.status_code == 200
        days = response.get_json()["days"]
        assert days[3]["split_day_id"] == day_ids[0]

    def test_reatribui_um_dia_para_descanso(self, app, auth_client):
        split_id, day_ids = _seed_split(app)
        auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})

        response = auth_client.put(
            "/api/workouts/weekly-plan/days/0", json={"split_day_id": None}
        )
        assert response.status_code == 200
        assert response.get_json()["days"][0]["split_day_id"] is None

    def test_sem_plano_devolve_404(self, auth_client):
        response = auth_client.put("/api/workouts/weekly-plan/days/0", json={"split_day_id": None})
        assert response.status_code == 404

    def test_split_day_id_de_outra_divisao_devolve_404(self, app, auth_client):
        split_id, _ = _seed_split(app)
        auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        _, other_day_ids = _seed_split(app, name="Outra Divisão", day_names=("Full Body",))

        response = auth_client.put(
            "/api/workouts/weekly-plan/days/0", json={"split_day_id": other_day_ids[0]}
        )
        assert response.status_code == 404


class TestDeleteWeeklyPlan:
    def test_apaga_plano_existente(self, app, auth_client):
        split_id, _ = _seed_split(app)
        auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})

        response = auth_client.delete("/api/workouts/weekly-plan")
        assert response.status_code == 200

        get_response = auth_client.get("/api/workouts/weekly-plan")
        assert get_response.get_json() == {"has_plan": False}

    def test_sem_plano_devolve_404(self, auth_client):
        response = auth_client.delete("/api/workouts/weekly-plan")
        assert response.status_code == 404


class TestSugestaoDeDescansoPorObjetivo:
    def test_sugestao_padrao_e_maintain_sem_metas_cadastradas(self, app, auth_client):
        split_id, _ = _seed_split(app)
        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert "sono e alimentação" not in response.get_json()["active_rest_suggestion"]

    def test_sugestao_muda_conforme_goal_type_do_usuario(self, app, auth_client, registered_user):
        split_id, _ = _seed_split(app)

        with app.app_context():
            from app.models import User
            user = User.query.filter_by(email=registered_user["email"]).first()
            db.session.add(UserGoals(user_id=user.id, goal_type="gain"))
            db.session.commit()

        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert "recuperação muscular" in response.get_json()["active_rest_suggestion"]

    def test_sugestao_para_goal_type_lose(self, app, auth_client, registered_user):
        split_id, _ = _seed_split(app)

        with app.app_context():
            from app.models import User
            user = User.query.filter_by(email=registered_user["email"]).first()
            db.session.add(UserGoals(user_id=user.id, goal_type="lose"))
            db.session.commit()

        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert "déficit calórico" in response.get_json()["active_rest_suggestion"]

    def test_sugestao_para_goal_type_maintain_explicito(self, app, auth_client, registered_user):
        split_id, _ = _seed_split(app)

        with app.app_context():
            from app.models import User
            user = User.query.filter_by(email=registered_user["email"]).first()
            db.session.add(UserGoals(user_id=user.id, goal_type="maintain"))
            db.session.commit()

        response = auth_client.post("/api/workouts/weekly-plan", json={"split_id": split_id})
        assert "sem sobrecarregar" in response.get_json()["active_rest_suggestion"]
