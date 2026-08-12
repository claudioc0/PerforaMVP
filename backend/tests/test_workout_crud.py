"""CRUD de sessões de treino e séries (`workout_service.py` / `workouts_routes.py`).

Antes destes testes, `workout_service.py` estava em 61% e `workouts_routes.py`
em 68% — o fluxo principal do app (registrar um treino ao vivo, série por
série) não tinha teste dedicado, só cobertura incidental via testes de N+1,
paginação e rollback. Aqui cobrimos o ciclo de vida completo (criar treino,
listar, detalhar, atualizar, adicionar/atualizar/apagar série, finalizar,
histórico por exercício, progresso agregado) e o isolamento por dono (404 em
vez de vazar dado de outro usuário).
"""

from app.extensions import db
from app.models import Exercise


def _seed_exercise(app, name="Supino Reto", muscle_group="peito"):
    with app.app_context():
        exercise = Exercise(
            name=name,
            normalized_name=name.lower(),
            muscle_group=muscle_group,
            is_custom=False,
        )
        db.session.add(exercise)
        db.session.commit()
        return exercise.id


class TestCreateAndListWorkouts:
    def test_cria_treino_com_nome(self, auth_client):
        response = auth_client.post("/api/workouts", json={"name": "Treino de Push"})
        assert response.status_code == 201
        body = response.get_json()
        assert body["name"] == "Treino de Push"
        assert body["finished_at"] is None

    def test_cria_treino_sem_nome_nao_quebra(self, auth_client):
        response = auth_client.post("/api/workouts", json={})
        assert response.status_code == 201

    def test_lista_treinos_do_usuario_mais_recente_primeiro(self, auth_client):
        auth_client.post("/api/workouts", json={"name": "Treino 1"})
        auth_client.post("/api/workouts", json={"name": "Treino 2"})

        response = auth_client.get("/api/workouts")
        assert response.status_code == 200
        items = response.get_json()["items"]
        assert len(items) == 2
        assert items[0]["name"] == "Treino 2"

    def test_lista_nao_traz_treino_de_outro_usuario(self, auth_client, second_auth_client):
        auth_client.post("/api/workouts", json={"name": "Treino do Dono"})
        second_auth_client.post("/api/workouts", json={"name": "Treino do Outro"})

        response = second_auth_client.get("/api/workouts")
        names = [w["name"] for w in response.get_json()["items"]]
        assert names == ["Treino do Outro"]


class TestGetWorkoutDetail:
    def test_detalhe_inclui_series_com_nome_e_grupo_do_exercicio_resolvidos(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        auth_client.post(
            f"/api/workouts/{workout_id}/sets",
            json={"exercise_id": exercise_id, "weight_kg": 60, "reps": 10},
        )

        response = auth_client.get(f"/api/workouts/{workout_id}")
        assert response.status_code == 200
        sets = response.get_json()["sets"]
        assert len(sets) == 1
        assert sets[0]["exercise_name"] == "Supino Reto"
        assert sets[0]["muscle_group"] == "peito"

    def test_treino_inexistente_devolve_404(self, auth_client):
        response = auth_client.get("/api/workouts/99999")
        assert response.status_code == 404

    def test_treino_de_outro_usuario_devolve_404(self, auth_client, second_auth_client):
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        response = auth_client.get(f"/api/workouts/{workout_id}")
        assert response.status_code == 404


class TestUpdateWorkout:
    def test_atualiza_nome_e_notas(self, auth_client):
        workout_id = auth_client.post("/api/workouts", json={"name": "Original"}).get_json()["id"]
        response = auth_client.put(
            f"/api/workouts/{workout_id}", json={"name": "Renomeado", "notes": "Boa sessão"}
        )
        assert response.status_code == 200
        body = response.get_json()
        assert body["name"] == "Renomeado"
        assert body["notes"] == "Boa sessão"

    def test_finished_marca_finished_at(self, auth_client):
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        response = auth_client.put(f"/api/workouts/{workout_id}", json={"finished": True})
        assert response.status_code == 200
        assert response.get_json()["finished_at"] is not None

    def test_sem_dados_devolve_400(self, auth_client):
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        response = auth_client.put(f"/api/workouts/{workout_id}", json={})
        assert response.status_code == 400

    def test_treino_de_outro_usuario_devolve_404(self, auth_client, second_auth_client):
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        response = auth_client.put(f"/api/workouts/{workout_id}", json={"name": "Invasão"})
        assert response.status_code == 404


class TestDeleteWorkout:
    def test_apaga_treino_do_dono(self, auth_client):
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        response = auth_client.delete(f"/api/workouts/{workout_id}")
        assert response.status_code == 200
        assert auth_client.get(f"/api/workouts/{workout_id}").status_code == 404

    def test_apagar_treino_de_outro_usuario_devolve_404(self, auth_client, second_auth_client):
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        response = auth_client.delete(f"/api/workouts/{workout_id}")
        assert response.status_code == 404
        # E o treino do outro usuário continua existindo, intacto.
        assert second_auth_client.get(f"/api/workouts/{workout_id}").status_code == 200


class TestSets:
    def test_add_set_incrementa_set_number_por_exercicio(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]

        first = auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 12}
        )
        second = auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 42, "reps": 10}
        )
        assert first.get_json()["set_number"] == 1
        assert second.get_json()["set_number"] == 2

    def test_add_set_sem_exercise_id_devolve_400(self, auth_client):
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        response = auth_client.post(f"/api/workouts/{workout_id}/sets", json={"weight_kg": 40})
        assert response.status_code == 400

    def test_add_set_em_treino_de_outro_usuario_devolve_404(self, app, auth_client, second_auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        response = auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id}
        )
        assert response.status_code == 404

    def test_update_set_altera_peso_e_reps(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        set_id = auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 12}
        ).get_json()["id"]

        response = auth_client.put(
            f"/api/workouts/{workout_id}/sets/{set_id}", json={"weight_kg": 45, "reps": 8}
        )
        assert response.status_code == 200
        assert response.get_json()["weight_kg"] == 45
        assert response.get_json()["reps"] == 8

    def test_update_set_de_outro_usuario_devolve_404(self, app, auth_client, second_auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        set_id = second_auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 12}
        ).get_json()["id"]

        response = auth_client.put(
            f"/api/workouts/{workout_id}/sets/{set_id}", json={"weight_kg": 999}
        )
        assert response.status_code == 404

    def test_delete_set(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        set_id = auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 12}
        ).get_json()["id"]

        response = auth_client.delete(f"/api/workouts/{workout_id}/sets/{set_id}")
        assert response.status_code == 200
        assert auth_client.get(f"/api/workouts/{workout_id}").get_json()["sets"] == []

    def test_delete_set_de_outro_usuario_devolve_404(self, app, auth_client, second_auth_client):
        exercise_id = _seed_exercise(app)
        workout_id = second_auth_client.post("/api/workouts", json={"name": "Privado"}).get_json()["id"]
        set_id = second_auth_client.post(
            f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 12}
        ).get_json()["id"]

        response = auth_client.delete(f"/api/workouts/{workout_id}/sets/{set_id}")
        assert response.status_code == 404


class TestExerciseHistoryAndProgress:
    def test_historico_agrupa_series_por_treino_mais_recente_primeiro(self, app, auth_client):
        exercise_id = _seed_exercise(app)

        workout1 = auth_client.post("/api/workouts", json={"name": "Treino 1"}).get_json()["id"]
        auth_client.post(f"/api/workouts/{workout1}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 10})

        workout2 = auth_client.post("/api/workouts", json={"name": "Treino 2"}).get_json()["id"]
        auth_client.post(f"/api/workouts/{workout2}/sets", json={"exercise_id": exercise_id, "weight_kg": 45, "reps": 8})

        response = auth_client.get(f"/api/workouts/exercises/{exercise_id}/history")
        assert response.status_code == 200
        history = response.get_json()
        assert len(history) == 2
        assert history[0]["workout_id"] == workout2

    def test_historico_respeita_limit(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        for i in range(3):
            workout_id = auth_client.post("/api/workouts", json={"name": f"Treino {i}"}).get_json()["id"]
            auth_client.post(f"/api/workouts/{workout_id}/sets", json={"exercise_id": exercise_id, "weight_kg": 40, "reps": 10})

        response = auth_client.get(f"/api/workouts/exercises/{exercise_id}/history?limit=1")
        assert len(response.get_json()) == 1

    def test_historico_sem_series_devolve_lista_vazia(self, app, auth_client):
        exercise_id = _seed_exercise(app)
        response = auth_client.get(f"/api/workouts/exercises/{exercise_id}/history")
        assert response.get_json() == []

    def test_progresso_agrega_tonelagem_reps_e_descanso_medio_so_de_treinos_finalizados(self, app, auth_client):
        exercise_id = _seed_exercise(app)

        workout_id = auth_client.post("/api/workouts", json={"name": "Treino"}).get_json()["id"]
        auth_client.post(
            f"/api/workouts/{workout_id}/sets",
            json={"exercise_id": exercise_id, "weight_kg": 50, "reps": 10, "rest_seconds": 60},
        )
        auth_client.post(
            f"/api/workouts/{workout_id}/sets",
            json={"exercise_id": exercise_id, "weight_kg": 50, "reps": 10, "rest_seconds": 90},
        )
        # Treino ainda não finalizado não deve aparecer no progresso.
        unfinished = auth_client.get("/api/workouts/progress").get_json()
        assert unfinished == []

        auth_client.put(f"/api/workouts/{workout_id}", json={"finished": True})
        response = auth_client.get("/api/workouts/progress")
        assert response.status_code == 200
        progress = response.get_json()
        assert len(progress) == 1
        assert progress[0]["total_tonnage"] == 50 * 10 + 50 * 10
        assert progress[0]["total_reps"] == 20
        assert progress[0]["avg_rest_seconds"] == 75.0
