import os
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate # <-- 1. IMPORTAÇÃO DO MIGRATE

from .config import Config
from .extensions import cors, db
from .models.user import User
from .models.meal import Meal
# Lembre-se de importar seus outros models aqui também, como FavoriteMeal e WeightLog
from .models.favorite_meal import FavoriteMeal 
from .models.weight_log import WeightLog

# <-- 2. INICIALIZAÇÃO GLOBAL DO MIGRATE
migrate = Migrate() 

def create_app(config_class=Config):
    """
    Application factory pattern.
    """
    app = Flask(__name__, instance_relative_config=True)

    # Carrega as configurações do objeto de configuração
    app.config.from_object(config_class)

    # **CORREÇÃO: Configura onde o Flask-JWT-Extended deve procurar o token**
    app.config["JWT_TOKEN_LOCATION"] = ["headers"]

    # Inicializa as extensões do Flask
    db.init_app(app)
    migrate.init_app(app, db) # <-- 3. CONECTA O MIGRATE AO APP E AO BANCO
    
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})
    jwt = JWTManager(app)

    # Registra os Blueprints (rotas)
    from .routes import auth_routes, meals_routes, user_routes
    app.register_blueprint(auth_routes.auth_bp)
    app.register_blueprint(meals_routes.meals_bp)
    app.register_blueprint(user_routes.user_bp)

    # with app.app_context():
        # db.create_all() # <-- 4. COMENTADO PARA DEIXAR O MIGRATE TRABALHAR

    return app