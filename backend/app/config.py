import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class Config:
    """Configuração central do microserviço.

    Mantém o serviço desacoplado: nada aqui conhece detalhes do frontend
    ou de outros serviços, apenas o que este microserviço precisa para rodar.
    """

    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")

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
