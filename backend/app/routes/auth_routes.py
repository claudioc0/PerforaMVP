import logging
from flask import Blueprint, request, jsonify
import re
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

# Ajuste as importações conforme a estrutura do seu projeto
from app import db
from app.extensions import limiter
from app.models import User, TokenBlocklist

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

def _validate_password_strength(password: str) -> list[str]:
    """
    Valida a força da senha e retorna uma lista de problemas encontrados.
    Retorna uma lista vazia se a senha for forte.
    """
    errors = []
    if len(password) < 8:
        errors.append("Deve ter pelo menos 8 caracteres.")
    if not re.search(r"[A-Z]", password):
        errors.append("Deve conter pelo menos uma letra maiúscula.")
    if not re.search(r"[a-z]", password):
        errors.append("Deve conter pelo menos uma letra minúscula.")
    if not re.search(r"[0-9]", password):
        errors.append("Deve conter pelo menos um número.")
    return errors

@auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.json or {}
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({"error": "Preencha todos os campos obrigatórios."}), 400

    # Validação de senha forte
    password_errors = _validate_password_strength(password)
    if password_errors:
        return jsonify({
            "error": "A senha não atende aos critérios de segurança.",
            "details": password_errors
        }), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Este e-mail já está em uso."}), 409

    try:
        new_user = User(name=name, email=email)
        new_user.set_password(password) # Gera o hash da senha

        db.session.add(new_user)
        db.session.commit()

        return jsonify({"message": "Usuário criado com sucesso!"}), 201
    except Exception as e:
        db.session.rollback()
        logger.exception("Erro ao criar usuário")
        return jsonify({"error": "Erro interno ao criar conta."}), 500

@auth_bp.route("/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "E-mail e senha são obrigatórios."}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password): # Usa o método seguro para verificar a senha
        return jsonify({"error": "E-mail ou senha inválidos."}), 401

    # Gera o Access Token (curta duração) e o Refresh Token (longa duração)
    # embutindo o ID do usuário como a identidade
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        "token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }), 200

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Troca um Refresh Token válido por um novo Access Token, sem exigir login de novo."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    return jsonify({"token": new_access_token}), 200

@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Revoga o access token usado nesta requisição e, se enviado no corpo, o
    refresh token da mesma sessão — os dois param de funcionar imediatamente,
    mesmo que ainda não tenham expirado.

    Antes, só o access token (validade de 1h) era revogado. O refresh token
    (validade de 7 dias) continuava funcionando normalmente depois do
    "logout", bastando chamar /auth/refresh com ele pra emitir um access
    token novo — ou seja, um refresh token vazado sobrevivia ao logout.
    """
    jtis_to_revoke = {get_jwt()["jti"]}

    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token")
    if refresh_token:
        try:
            decoded = decode_token(refresh_token)
        except Exception:
            # Refresh token ausente/expirado/malformado não deve impedir de
            # revogar o access token, que é o que importa nesta requisição.
            logger.warning("Refresh token inválido recebido no logout; ignorando.")
        else:
            if decoded.get("type") == "refresh":
                jtis_to_revoke.add(decoded["jti"])

    try:
        # Idempotente: se algum desses jtis já estiver na blocklist (ex: uma
        # chamada de logout repetida), não tenta inserir de novo.
        already_blocked = {
            row.jti
            for row in TokenBlocklist.query.filter(TokenBlocklist.jti.in_(jtis_to_revoke)).all()
        }
        for jti in jtis_to_revoke - already_blocked:
            db.session.add(TokenBlocklist(jti=jti))
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Erro ao revogar token(s) no logout")
        return jsonify({"error": "Erro interno ao encerrar a sessão."}), 500

    return jsonify({"message": "Logout realizado com sucesso."}), 200
