import os
from flask import Flask
from flask_jwt_extended import JWTManager

from .config import Config
from .extensions import cors, db
from .models.user import User
from .models.meal import Meal


def create_app(config_class=Config):
    """
    Application factory pattern.
    """
    app = Flask(__name__, instance_relative_config=True)

    # Carrega as configurações do objeto de configuração
    app.config.from_object(config_class)

    # **CORREÇÃO: Configura onde o Flask-JWT-Extended deve procurar o token**
    # Isso instrui a biblioteca a procurar o token no cabeçalho 'Authorization'.
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]

    # Inicializa as extensões do Flask
    db.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    jwt = JWTManager(app)

    # Registra os Blueprints (rotas)
    from .routes import auth_routes, meals_routes, user_routes
    app.register_blueprint(auth_routes.auth_bp)
    app.register_blueprint(meals_routes.meals_bp)
    app.register_blueprint(user_routes.user_bp)

    with app.app_context():
        # Cria as tabelas do banco de dados se não existirem
        db.create_all()

    return app