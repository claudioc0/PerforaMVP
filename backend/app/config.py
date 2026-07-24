import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class Config:
    """Configuração central do microserviço.

    Mantém o serviço desacoplado: nada aqui conhece detalhes do frontend
    ou de outros serviços, apenas o que este microserviço precisa para rodar.

    SECRET_KEY e JWT_SECRET_KEY NÃO têm valor padrão aqui de propósito — devem
    vir do .env. Se estiverem ausentes, o Flask/Flask-JWT-Extended falham ao
    tentar assinar sessão/token, o que é o comportamento correto: preferimos
    quebrar alto (fail fast) a rodar em produção com uma chave previsível.
    Só o TestConfig, abaixo, define valores fixos — e só para uso em testes.
    """

    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

    # Só fica em modo debug se FLASK_ENV=development for explicitado no .env.
    # Qualquer outro valor (ou ausência) assume produção por segurança.
    DEBUG = os.getenv("FLASK_ENV", "production") == "development"

    # Em produção, defina CORS_ORIGINS com a(s) origem(ns) real(is) separadas por vírgula
    # (ex: "https://meuapp.com,https://admin.meuapp.com"). "*" só é seguro em desenvolvimento.
    _cors_origins_env = os.getenv("CORS_ORIGINS", "*")
    CORS_ORIGINS = "*" if _cors_origins_env == "*" else [o.strip() for o in _cors_origins_env.split(",")]

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'nutrition.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash-lastest")

    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8MB por imagem

    # --- JWT ---
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)

    # --- Rate limiting (Flask-Limiter) ---
    # "memory://" é suficiente pra um único processo (MVP). Se o backend rodar
    # com múltiplos workers/processos, troque por um storage compartilhado
    # (ex: "redis://localhost:6379") pra todos os workers verem o mesmo contador.
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")

    # --- Criptografia de dados sensíveis em repouso (preparação) ---
    # Chave Fernet (32 bytes url-safe base64). Gere uma com:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")


class TestConfig(Config):
    """Configuração usada pela suite de testes (pytest).

    Valores fixos e seguros só para esse contexto — nunca reutilizar em produção.
    Banco em memória: cada execução de teste começa com um SQLite limpo e isolado.
    """

    TESTING = True
    SECRET_KEY = "test-only-secret-key-never-use-in-production"
    JWT_SECRET_KEY = "test-only-jwt-secret-key-never-use-in-production"
    ENCRYPTION_KEY = "wcGnCYFwPmWJv7Cnu5PJIkYyLwm7_lJ-a5wR8h5uQXo="  # chave Fernet válida, só de teste
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    RATELIMIT_STORAGE_URI = "memory://"
    RATELIMIT_ENABLED = True

    # Placeholder — nunca deve gerar uma chamada de rede real nos testes de auth,
    # só existe pra passar na checagem "if not api_key" do GeminiService.
    GEMINI_API_KEY = "test-fake-gemini-key"
