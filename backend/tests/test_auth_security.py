"""
Testes de segurança da autenticação do Perfora.

Cobrem os três pontos pedidos:
1. Senha nunca é salva em texto plano.
2. Rate limiting bloqueia força bruta em /login.
3. Rotas protegidas rejeitam requisições sem token, com token inválido,
   expirado ou revogado (logout).
"""
from datetime import timedelta

from flask_jwt_extended import create_access_token

from app.models import User

# Rota protegida usada nos testes de token — não depende de Gemini nem de
# nenhum outro serviço externo, só de estar autenticado.
PROTECTED_ROUTE = "/api/user/goals"


def _login(client, credentials):
    return client.post(
        "/api/auth/login",
        json={"email": credentials["email"], "password": credentials["password"]},
    )


class TestPasswordStorage:
    def test_password_is_not_stored_in_plaintext(self, app, client, user_credentials):
        response = client.post("/api/auth/register", json=user_credentials)
        assert response.status_code == 201

        with app.app_context():
            user = User.query.filter_by(email=user_credentials["email"]).first()

            assert user is not None
            # A senha crua jamais deve aparecer no hash salvo
            assert user.password_hash != user_credentials["password"]
            assert user_credentials["password"] not in user.password_hash
            # Hash do werkzeug (scrypt/pbkdf2) sempre tem o método como prefixo
            assert user.password_hash.startswith(("pbkdf2:", "scrypt:"))
            # E o hash deve validar corretamente a senha original
            assert user.check_password(user_credentials["password"]) is True


class TestRateLimiting:
    def test_login_rate_limit_blocks_after_5_attempts(self, client, registered_user):
        wrong_credentials = {"email": registered_user["email"], "password": "SenhaErrada1"}

        statuses = [
            _login(client, wrong_credentials).status_code
            for _ in range(6)
        ]

        # As 5 primeiras tentativas são recusadas por credenciais inválidas (401).
        assert statuses[:5] == [401, 401, 401, 401, 401]
        # A 6ª tentativa no mesmo minuto deve ser bloqueada pelo rate limiter (429).
        assert statuses[5] == 429


class TestProtectedRoutesTokenValidation:
    def test_rejects_request_without_token(self, client):
        response = client.get(PROTECTED_ROUTE)
        assert response.status_code == 401

    def test_rejects_malformed_token(self, client):
        response = client.get(
            PROTECTED_ROUTE,
            headers={"Authorization": "Bearer isso-nao-e-um-jwt-valido"},
        )
        assert response.status_code in (401, 422)

    def test_rejects_expired_token(self, app, registered_user, client):
        with app.app_context():
            user = User.query.filter_by(email=registered_user["email"]).first()
            expired_token = create_access_token(
                identity=str(user.id),
                expires_delta=timedelta(seconds=-1),
            )

        response = client.get(
            PROTECTED_ROUTE,
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401

    def test_rejects_token_revoked_by_logout(self, client, registered_user):
        login_response = _login(client, registered_user)
        assert login_response.status_code == 200
        token = login_response.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Antes do logout, o token funciona normalmente.
        before_logout = client.get(PROTECTED_ROUTE, headers=headers)
        assert before_logout.status_code == 200

        logout_response = client.post("/api/auth/logout", headers=headers)
        assert logout_response.status_code == 200

        # Depois do logout, o MESMO token deve ser rejeitado — mesmo sem ter expirado.
        after_logout = client.get(PROTECTED_ROUTE, headers=headers)
        assert after_logout.status_code == 401
