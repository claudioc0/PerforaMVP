from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Instanciados fora do create_app para evitar import circular
# e permitir múltiplos "app factories" (ex: testes).
db = SQLAlchemy()
cors = CORS()

# key_func=get_remote_address: cada IP tem seu próprio contador de requisições.
# Os limites de cada rota são definidos onde a rota é declarada (ver auth_routes.py).
limiter = Limiter(key_func=get_remote_address)
