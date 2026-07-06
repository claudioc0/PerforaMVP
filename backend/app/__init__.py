import logging
import os

from flask import Flask

from app.config import Config
from app.extensions import cors, db


def create_app(config_class: type = Config) -> Flask:
    """Application factory. Permite criar múltiplas instâncias do app
    (produção, testes) sem estado global compartilhado — essencial para
    manter este módulo como um microserviço isolado e testável.
    """
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)

    os.makedirs(app.instance_path, exist_ok=True)

    logging.basicConfig(level=logging.INFO)

    # CORS liberado para o app mobile consumir a API livremente no MVP.
    # Em produção, restrinja origins conforme necessário.
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)

    from app.routes import meals_bp

    app.register_blueprint(meals_bp)

    with app.app_context():
        from app.models import Meal  # noqa: F401 - garante que o modelo seja registrado

        db.create_all()

    @app.route("/")
    def index():
        return {"service": "nutrition-meals-service", "status": "running"}

    return app
