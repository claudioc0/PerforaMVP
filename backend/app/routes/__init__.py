from app.routes.meals_routes import meals_bp
from app.routes.auth_routes import auth_bp
from app.routes.user_routes import user_bp

# O __all__ diz ao Python o que deve ser exportado quando alguém fizer 'from app.routes import *'
__all__ = ["meals_bp", "auth_bp", "user_bp"]