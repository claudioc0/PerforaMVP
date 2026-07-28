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


class _AuthenticatedClient:
    """Encapsula o FlaskClient injetando o header de autorização em todo
    GET/POST/PUT/DELETE — escrever um teste de rota nova não precisa mais
    repetir `headers=auth_headers` em cada chamada. Headers passados
    explicitamente numa chamada têm prioridade sobre o padrão (útil pra
    testar, por exemplo, um token ausente/inválido de propósito)."""

    def __init__(self, client, default_headers):
        self._client = client
        self._default_headers = default_headers

    def _call(self, method, *args, **kwargs):
        headers = {**self._default_headers, **(kwargs.pop("headers", None) or {})}
        return getattr(self._client, method)(*args, headers=headers, **kwargs)

    def get(self, *args, **kwargs):
        return self._call("get", *args, **kwargs)

    def post(self, *args, **kwargs):
        return self._call("post", *args, **kwargs)

    def put(self, *args, **kwargs):
        return self._call("put", *args, **kwargs)

    def delete(self, *args, **kwargs):
        return self._call("delete", *args, **kwargs)


@pytest.fixture
def auth_client(client, auth_headers):
    """Cliente de teste já autenticado — todo GET/POST/PUT/DELETE sai com o
    header Authorization sem precisar passar `headers=auth_headers` em cada
    chamada. Use `client`+`auth_headers` direto só quando o teste precisar
    controlar os headers manualmente (ex: testar sem token, ou com um token
    inválido de propósito)."""
    return _AuthenticatedClient(client, auth_headers)
