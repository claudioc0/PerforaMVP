from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Instanciados fora do create_app para evitar import circular
# e permitir múltiplos "app factories" (ex: testes).
db = SQLAlchemy()
cors = CORS()

# key_func=get_remote_address: cada IP tem seu próprio contador de requisições.
# Os limites de cada rota são definidos onde a rota é declarada (ver auth_routes.py).
limiter = Limiter(key_func=get_remote_address)


def rate_limit_key_by_user():
    """key_func alternativo: limita por conta autenticada, não por IP.

    Necessário pra rotas que custam dinheiro por chamada (ex: /meals/analyze,
    que aciona o Gemini) — por IP sozinho, várias contas atrás do mesmo NAT/Wi-Fi
    dividiriam o mesmo balde de limite, e uma única conta girando de IP escaparia
    dele. O Flask-Limiter checa o limite no before_request do Flask, ou seja,
    ANTES do @jwt_required() da própria view rodar — por isso verificamos o JWT
    aqui de novo, em modo tolerante (optional=True): se faltar ou for inválido,
    apenas caímos pro limite por IP, e o @jwt_required() da view cuida de
    rejeitar a requisição do jeito certo logo em seguida.
    """
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
    except Exception:
        identity = None
    return f"user:{identity}" if identity else f"ip:{get_remote_address()}"
