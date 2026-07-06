from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

# Instanciados fora do create_app para evitar import circular
# e permitir múltiplos "app factories" (ex: testes).
db = SQLAlchemy()
cors = CORS()
