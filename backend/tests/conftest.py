import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db as _db


@pytest.fixture
def app():
    """Uma instância nova do app por teste, com banco SQLite em memória isolado."""
    application = create_app(TestConfig)

    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def user_credentials():
    """Dados de um usuário válido, prontos pra registrar/logar nos testes."""
    return {"name": "Usuário de Teste", "email": "teste@example.com", "password": "SenhaForte1"}


@pytest.fixture
def registered_user(client, user_credentials):
    """Registra o usuário de teste no banco e devolve as credenciais pra logar depois."""
    response = client.post("/api/auth/register", json=user_credentials)
    assert response.status_code == 201
    return user_credentials


@pytest.fixture
def auth_headers(client, registered_user):
    """Headers com o token de um usuário já logado, prontos pra chamar rotas protegidas."""
    response = client.post(
        "/api/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.get_json()['token']}"}
