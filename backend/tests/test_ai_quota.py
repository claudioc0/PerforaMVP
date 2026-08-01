"""Feature: cota diária de IA + premium — AiQuotaService.check_and_consume e
o bloqueio 429 nas rotas /meals/analyze e /meals/analyze-label.
"""
from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import User
from app.services.ai_quota_service import FREE_DAILY_LIMIT, AiQuotaService
from app.services.gemini_service import GeminiService, MealAnalysisResult, MealItemResult


def _fake_analysis_result():
    return MealAnalysisResult(
        items=[MealItemResult(description="Item", calories=100.0, protein_g=10.0, carbs_g=10.0, fat_g=5.0, estimated_grams=100.0)],
        confidence=0.9,
    )


@pytest.fixture(autouse=True)
def _mock_gemini_calls(monkeypatch):
    monkeypatch.setattr(GeminiService, "analyze_text", lambda self, description: _fake_analysis_result())
    monkeypatch.setattr(GeminiService, "analyze_image", lambda self, image: _fake_analysis_result())


def _make_user(email, is_premium=False):
    user = User(name="Teste Cota", email=email, is_premium=is_premium)
    user.set_password("SenhaForte1")
    db.session.add(user)
    db.session.commit()
    return user


def _register_and_login(client, email):
    credentials = {"name": "Teste Cota", "email": email, "password": "SenhaForte1"}
    resp = client.post("/api/auth/register", json=credentials)
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"email": email, "password": credentials["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['token']}"}


class TestCheckAndConsume:
    def test_primeira_chamada_do_dia_e_permitida_e_decrementa_remaining(self, app):
        with app.app_context():
            user = _make_user("cota-a@example.com")
            service = AiQuotaService()

            result = service.check_and_consume(user.id)

            assert result == {"allowed": True, "remaining": FREE_DAILY_LIMIT - 1, "is_premium": False}

    def test_bloqueia_apos_esgotar_o_limite_do_dia(self, app):
        with app.app_context():
            user = _make_user("cota-b@example.com")
            service = AiQuotaService()

            for _ in range(FREE_DAILY_LIMIT):
                assert service.check_and_consume(user.id)["allowed"] is True

            result = service.check_and_consume(user.id)
            assert result == {"allowed": False, "remaining": 0, "is_premium": False}

    def test_premium_nunca_bloqueia_mesmo_apos_n_mais_1_chamadas(self, app):
        with app.app_context():
            user = _make_user("cota-c@example.com", is_premium=True)
            service = AiQuotaService()

            for _ in range(FREE_DAILY_LIMIT + 5):
                result = service.check_and_consume(user.id)
                assert result == {"allowed": True, "remaining": None, "is_premium": True}

    def test_reseta_o_contador_ao_virar_o_dia(self, app):
        with app.app_context():
            user = _make_user("cota-d@example.com")
            user.daily_ai_calls_count = FREE_DAILY_LIMIT
            user.daily_ai_calls_date = date.today() - timedelta(days=1)
            db.session.commit()
            service = AiQuotaService()

            result = service.check_and_consume(user.id)

            assert result == {"allowed": True, "remaining": FREE_DAILY_LIMIT - 1, "is_premium": False}


class TestRotaAnalyzeRespeitaACota:
    def test_bloqueia_com_429_e_reason_apos_esgotar(self, client):
        headers = _register_and_login(client, "cota-rota-a@example.com")

        statuses = [
            client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers).status_code
            for _ in range(FREE_DAILY_LIMIT)
        ]
        assert 429 not in statuses

        bloqueado = client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers)
        assert bloqueado.status_code == 429
        body = bloqueado.get_json()
        assert body["reason"] == "daily_quota_exceeded"
        assert body["remaining"] == 0

    def test_sucesso_inclui_ai_quota_no_corpo(self, client):
        headers = _register_and_login(client, "cota-rota-b@example.com")

        response = client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers)

        assert response.status_code == 200
        assert response.get_json()["ai_quota"] == {"remaining": FREE_DAILY_LIMIT - 1, "is_premium": False}

    def test_premium_nunca_bloqueia_na_rota(self, client, app):
        headers = _register_and_login(client, "cota-rota-c@example.com")
        with app.app_context():
            User.query.filter_by(email="cota-rota-c@example.com").update({"is_premium": True})
            db.session.commit()

        statuses = [
            client.post("/api/meals/analyze", json={"description": "arroz"}, headers=headers).status_code
            for _ in range(FREE_DAILY_LIMIT + 2)
        ]

        assert 429 not in statuses

    def test_analyze_label_tambem_respeita_a_cota(self, client, monkeypatch):
        from io import BytesIO

        monkeypatch.setattr(GeminiService, "analyze_label", lambda self, image: {
            "description": "Produto", "calories": 100, "protein_g": 5, "carbs_g": 10, "fat_g": 2,
        })
        headers = _register_and_login(client, "cota-rota-d@example.com")

        def _post_label():
            return client.post(
                "/api/meals/analyze-label",
                data={"image": (BytesIO(b"fake-bytes"), "rotulo.jpg")},
                content_type="multipart/form-data",
                headers=headers,
            )

        statuses = [_post_label().status_code for _ in range(FREE_DAILY_LIMIT)]
        assert 429 not in statuses

        assert _post_label().status_code == 429
