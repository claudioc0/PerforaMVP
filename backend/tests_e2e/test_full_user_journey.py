"""Jornada completa de um usuário novo, contra o servidor Flask real (processo
próprio, HTTP de verdade) com banco migrado do zero — ver `conftest.py` pro
porquê disso ser diferente da suíte de integração em `tests/`.

Um único teste sequencial (não vários independentes) de propósito: o valor do
E2E aqui é validar que o processo inteiro — cadastro, login, uso normal do
app, refresh de token, logout — se sustenta em conjunto contra um servidor e
banco reais, do jeito que um app mobile de verdade bateria nele. Testes
isolados por endpoint já existem em fartura na suíte de integração.
"""

import uuid

import pytest
import requests


@pytest.fixture(scope="module")
def user_email():
    # Único por execução — o servidor E2E é recriado do zero a cada sessão de
    # teste, mas usar um e-mail aleatório evita qualquer acoplamento acidental
    # com ordem de execução caso o módulo rode mais de uma vez no futuro.
    return f"e2e-{uuid.uuid4().hex[:10]}@example.com"


def test_jornada_completa_de_um_usuario_novo(live_server, user_email):
    session = requests.Session()
    password = "SenhaForte1"

    # --- Cadastro ---
    register = session.post(f"{live_server}/api/auth/register", json={
        "name": "Usuário E2E", "email": user_email, "password": password,
    })
    assert register.status_code == 201, register.text

    # E-mail duplicado é rejeitado
    duplicate = session.post(f"{live_server}/api/auth/register", json={
        "name": "Outro Nome", "email": user_email, "password": password,
    })
    assert duplicate.status_code == 409

    # --- Login ---
    login = session.post(f"{live_server}/api/auth/login", json={
        "email": user_email, "password": password,
    })
    assert login.status_code == 200, login.text
    tokens = login.json()
    access_token = tokens["token"]
    refresh_token = tokens["refresh_token"]
    auth_headers = {"Authorization": f"Bearer {access_token}"}

    # Rota protegida sem token: 401
    unauthorized = session.get(f"{live_server}/api/user/goals")
    assert unauthorized.status_code == 401

    # --- Metas calculadas automaticamente (TDEE/macros) ---
    goals = session.post(f"{live_server}/api/user/calculate-goals", headers=auth_headers, json={
        "weight": 75, "height": 175, "age": 28, "gender": "M",
        "activity_level": 1.55, "goal": "maintain",
    })
    assert goals.status_code == 200, goals.text
    assert goals.json()["goals"]["goal_calories"] > 0

    # --- Água ---
    water = session.post(f"{live_server}/api/user/water/add", headers=auth_headers, json={"amount": 500})
    assert water.status_code == 200, water.text
    assert water.json()["total"] == 500

    # --- Peso ---
    weight = session.post(f"{live_server}/api/user/weight", headers=auth_headers, json={"weight": 74.5})
    assert weight.status_code == 201, weight.text

    weight_history = session.get(f"{live_server}/api/user/weight", headers=auth_headers)
    assert weight_history.status_code == 200
    assert len(weight_history.json()["items"]) == 1

    # --- Divisões de treino (seed real das migrations, não fixture de teste) ---
    splits = session.get(f"{live_server}/api/workouts/splits", headers=auth_headers)
    assert splits.status_code == 200
    assert len(splits.json()) > 0, "seed de divisões de treino da migration não veio"
    split = splits.json()[0]

    # --- Plano semanal a partir da divisão de verdade ---
    plan = session.post(f"{live_server}/api/workouts/weekly-plan", headers=auth_headers, json={
        "split_id": split["id"],
    })
    assert plan.status_code == 201, plan.text
    assert plan.json()["has_plan"] is True

    # --- Sessão de treino completa: criar, adicionar séries, finalizar ---
    exercises = session.get(f"{live_server}/api/workouts/exercises?per_page=1", headers=auth_headers)
    assert exercises.status_code == 200
    assert exercises.json()["items"], "catálogo global de exercícios da migration veio vazio"
    exercise_id = exercises.json()["items"][0]["id"]

    workout = session.post(f"{live_server}/api/workouts", headers=auth_headers, json={"name": "Treino E2E"})
    assert workout.status_code == 201
    workout_id = workout.json()["id"]

    set_response = session.post(
        f"{live_server}/api/workouts/{workout_id}/sets", headers=auth_headers,
        json={"exercise_id": exercise_id, "weight_kg": 60, "reps": 10},
    )
    assert set_response.status_code == 201, set_response.text

    finish = session.put(f"{live_server}/api/workouts/{workout_id}", headers=auth_headers, json={"finished": True})
    assert finish.status_code == 200
    assert finish.json()["finished_at"] is not None

    progress = session.get(f"{live_server}/api/workouts/progress", headers=auth_headers)
    assert progress.status_code == 200
    assert any(p["workout_id"] == workout_id for p in progress.json())

    # --- Refeição salva direto (sem IA — cobertura de IA é papel de outra suíte) ---
    meal = session.post(f"{live_server}/api/meals/save", headers=auth_headers, json={
        "description": "Arroz, feijão e frango", "calories": 650,
        "protein_g": 45, "carbs_g": 70, "fat_g": 15,
    })
    assert meal.status_code == 201, meal.text

    today = session.get(f"{live_server}/api/meals/today", headers=auth_headers)
    assert today.status_code == 200
    assert today.json()["total_calories"] >= 650

    # --- Relatório exportável, PDF e CSV, contra o backend real (reportlab) ---
    pdf_report = session.get(f"{live_server}/api/user/report?format=pdf", headers=auth_headers)
    assert pdf_report.status_code == 200
    assert pdf_report.headers["Content-Type"] == "application/pdf"
    assert pdf_report.content[:4] == b"%PDF"

    csv_report = session.get(f"{live_server}/api/user/report?format=csv", headers=auth_headers)
    assert csv_report.status_code == 200
    assert "text/csv" in csv_report.headers["Content-Type"]

    # --- Sequência (streak) ---
    streak = session.get(f"{live_server}/api/user/streak", headers=auth_headers)
    assert streak.status_code == 200
    assert streak.json()["current_streak"] >= 1

    # --- Refresh de token ---
    refresh = session.post(
        f"{live_server}/api/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert refresh.status_code == 200, refresh.text
    new_access_token = refresh.json()["token"]
    assert new_access_token != access_token

    # O access token antigo ainda funciona (refresh não revoga o antigo)
    still_valid = session.get(f"{live_server}/api/user/goals", headers=auth_headers)
    assert still_valid.status_code == 200

    # --- Logout revoga o access token usado na chamada ---
    logout = session.post(
        f"{live_server}/api/auth/logout", headers=auth_headers, json={"refresh_token": refresh_token},
    )
    assert logout.status_code == 200, logout.text

    revoked = session.get(f"{live_server}/api/user/goals", headers=auth_headers)
    assert revoked.status_code == 401, "token de acesso revogado no logout ainda foi aceito"

    # E o refresh token revogado junto no logout também não emite mais tokens novos
    refresh_after_logout = session.post(
        f"{live_server}/api/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert refresh_after_logout.status_code == 401


def test_isolamento_entre_dois_usuarios_contra_o_servidor_real(live_server):
    """Mesma finalidade dos testes de IDOR em `tests/`, mas aqui validando que
    o isolamento por dono também se sustenta passando por um servidor HTTP de
    verdade (headers, roteamento, serialização) — não só pela view function
    chamada em processo pelo test client."""
    session = requests.Session()
    password = "SenhaForte1"

    def _register_and_login(label):
        email = f"e2e-isolamento-{label}-{uuid.uuid4().hex[:8]}@example.com"
        session.post(f"{live_server}/api/auth/register", json={
            "name": f"Usuário {label}", "email": email, "password": password,
        })
        login = session.post(f"{live_server}/api/auth/login", json={"email": email, "password": password})
        return {"Authorization": f"Bearer {login.json()['token']}"}

    owner_headers = _register_and_login("dono")
    intruder_headers = _register_and_login("intruso")

    workout = session.post(f"{live_server}/api/workouts", headers=owner_headers, json={"name": "Privado"})
    workout_id = workout.json()["id"]

    leaked = session.get(f"{live_server}/api/workouts/{workout_id}", headers=intruder_headers)
    assert leaked.status_code == 404

    deleted = session.delete(f"{live_server}/api/workouts/{workout_id}", headers=intruder_headers)
    assert deleted.status_code == 404

    still_there = session.get(f"{live_server}/api/workouts/{workout_id}", headers=owner_headers)
    assert still_there.status_code == 200
