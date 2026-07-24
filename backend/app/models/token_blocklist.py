from datetime import datetime

from app.extensions import db


class TokenBlocklist(db.Model):
    """Lista negra de tokens JWT revogados (ex: por logout).

    Cada linha é um "jti" (JWT ID, identificador único do token) que não deve
    mais ser aceito, mesmo que a assinatura e a expiração ainda sejam válidas.
    """

    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
