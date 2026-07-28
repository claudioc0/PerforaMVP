import logging
import os
from datetime import datetime
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from werkzeug.exceptions import HTTPException

from .config import Config
from .extensions import cors, db, configure_sqlite_connection, limiter
# Importar do pacote `models` (em vez de enumerar cada módulo individualmente,
# como esta lista fazia antes) executa app/models/__init__.py por inteiro e
# registra TODOS os models no metadata do SQLAlchemy antes de qualquer
# db.create_all()/migração. A lista antiga cobria só uma parte deles —
# UserGoals e WaterLog nunca apareciam aqui e só funcionavam por serem
# importados transitivamente por outro módulo (user.py e o próprio
# app.models.__init__) — e podia voltar a ficar incompleta sem dar erro
# nenhum. A fonte única de verdade de quais models existem é
# app/models/__init__.py: um model novo só precisa ser adicionado lá.
from .models import TokenBlocklist  # usado abaixo, no callback de blocklist do JWT

migrate = Migrate()

logger = logging.getLogger(__name__)

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
    migrate.init_app(app, db)

    with app.app_context():
        configure_sqlite_connection(db.engine)

    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    limiter.init_app(app)
    jwt = JWTManager(app)

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        """Converte os erros do próprio Flask/Werkzeug (404 de rota
        inexistente, 405, 429 do rate limiter, 413 de upload grande demais
        etc.) de HTML pra JSON — todo cliente desta API (o app mobile) só
        sabe interpretar JSON, nunca recebeu uma página HTML de propósito."""
        return jsonify({"error": exc.description or exc.name}), exc.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(exc: Exception):
        """Rede de segurança final: sem isso, qualquer exceção que uma rota
        não tratasse explicitamente (várias rotas de user_routes.py e
        praticamente todas as de workouts_routes.py não tinham NENHUM
        try/except) devolvia a página HTML de erro 500 do Flask/Werkzeug pra
        um client que só sabe interpretar JSON.

        Também limpa a sessão do SQLAlchemy — um commit() que falhou sem seu
        próprio rollback deixaria a sessão numa transação pendente/inválida,
        arriscando contaminar qualquer código que ainda rode nesta mesma
        requisição (ou dependa dela) depois da falha.
        """
        db.session.rollback()
        logger.exception("Erro não tratado")
        return jsonify({"error": "Erro interno do servidor."}), 500

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

    @app.cli.command("cleanup-expired-tokens")
    def cleanup_expired_tokens():
        """Remove da blocklist os tokens já expirados (comando manual/cron).

        O logout já faz essa limpeza de forma oportunista a cada chamada
        (ver auth_routes.py), mas um app com poucos logouts pode acumular
        linhas por muito tempo entre uma chamada e outra. Rode este comando
        periodicamente (ex: cron job diário) como rede de segurança —
        remover uma linha expirada nunca reabre uma sessão revogada, porque
        o Flask-JWT-Extended já rejeita o token pela própria expiração,
        com ou sem essa linha na blocklist.
        """
        deleted = TokenBlocklist.query.filter(TokenBlocklist.expires_at < datetime.utcnow()).delete()
        db.session.commit()
        print(f"{deleted} token(s) expirado(s) removido(s) da blocklist.")

    return app
