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

    # Momento em que o PRÓPRIO token (não a linha) expira — vem da claim "exp"
    # do JWT revogado. Depois desse instante, o Flask-JWT-Extended já rejeita
    # o token por expiração, com ou sem essa linha na blocklist: mantê-la não
    # muda nada, então é sempre seguro apagá-la. É o que permite limpar a
    # tabela sem nunca revogar um token que ainda deveria estar bloqueado.
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
