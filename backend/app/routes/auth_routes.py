import logging
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token

# Ajuste as importações conforme a estrutura do seu projeto
from app import db 
from app.models import User 

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json or {}
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return jsonify({"error": "Preencha todos os campos obrigatórios."}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Este e-mail já está em uso."}), 409

    try:
        new_user = User(name=name, email=email)
        new_user.set_password(password)
        
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({"message": "Usuário criado com sucesso!"}), 201
    except Exception as e:
        db.session.rollback()
        logger.exception("Erro ao criar usuário")
        return jsonify({"error": "Erro interno ao criar conta."}), 500

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "E-mail e senha são obrigatórios."}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({"error": "E-mail ou senha inválidos."}), 401

    # Gera o Token embutindo o ID do usuário como a identidade
    access_token = create_access_token(identity=str(user.id))
    
    return jsonify({
        "token": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }), 200