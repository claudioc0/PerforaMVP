import os
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate # <-- 1. IMPORTAÇÃO DO MIGRATE

from .config import Config
from .extensions import cors, db, limiter
from .models.user import User
from .models.meal import Meal
# Lembre-se de importar seus outros models aqui também, como FavoriteMeal e WeightLog
from .models.favorite_meal import FavoriteMeal
from .models.weight_log import WeightLog
from .models.token_blocklist import TokenBlocklist
from .models.food_cache import FoodCache
from .models.exercise import Exercise
from .models.workout_split import WorkoutSplit
from .models.split_day import SplitDay
from .models.workout import Workout
from .models.set_log import SetLog
from .models.split_day_exercise import SplitDayExercise

# <-- 2. INICIALIZAÇÃO GLOBAL DO MIGRATE
migrate = Migrate()

def create_app(config_class=Config):
    """
    Application factory pattern.
    """
    app = Flask(__name__, instance_relative_config=True)

    # Carrega as configurações do objeto de configuração
    # (SECRET_KEY, JWT_SECRET_KEY, expiração de token, CORS, rate limit, etc.)
    app.config.from_object(config_class)

    # Inicializa as extensões do Flask
    db.init_app(app)
    migrate.init_app(app, db) # <-- 3. CONECTA O MIGRATE AO APP E AO BANCO

    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    limiter.init_app(app)
    jwt = JWTManager(app)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        """Chamado em toda requisição autenticada — rejeita tokens revogados (logout)."""
        jti = jwt_payload["jti"]
        return db.session.query(TokenBlocklist.id).filter_by(jti=jti).first() is not None

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token revogado. Faça login novamente."}), 401

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Sessão expirada. Faça login novamente."}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Token inválido."}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return jsonify({"error": "Token de acesso ausente."}), 401

    # Registra os Blueprints (rotas)
    from .routes import auth_routes, meals_routes, user_routes, workouts_routes
    app.register_blueprint(auth_routes.auth_bp)
    app.register_blueprint(meals_routes.meals_bp)
    app.register_blueprint(user_routes.user_bp)
    app.register_blueprint(workouts_routes.workouts_bp)

    # with app.app_context():
        # db.create_all() # <-- 4. COMENTADO PARA DEIXAR O MIGRATE TRABALHAR

    return app
