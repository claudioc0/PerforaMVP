from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.services import UserService
from app.models import User, WaterLog

# 1. CRIAÇÃO DO BLUEPRINT
# O prefixo completo da API é definido aqui para manter o módulo autônomo.
user_bp = Blueprint("user_bp", __name__, url_prefix="/api/user")

user_service = UserService()

@user_bp.route("/goals", methods=["GET"])
@jwt_required()
def get_user_goals_route():
    user_id = get_jwt_identity()
    goals = user_service.get_user_goals(user_id)
    
    if goals:
        return jsonify(goals.to_dict())
    # Se o usuário ainda não tem metas, retorna um objeto vazio para não quebrar o frontend.
    return jsonify({}), 200

@user_bp.route("/goals", methods=["PUT"])
@jwt_required()
def update_user_goals_route():
    user_id = get_jwt_identity()
    data = request.get_json()
    updated_user = user_service.update_user_goals(user_id, data)
    return jsonify(message="Metas atualizadas com sucesso", goals=updated_user.goals.to_dict())

@user_bp.route("/calculate-goals", methods=["POST"])
@jwt_required()
def calculate_goals_route():
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # O user_service agora lida com o cálculo e a atualização
    new_goals = user_service.calculate_and_save_smart_goals(user_id, data)

    return jsonify(message="Metas calculadas e salvas com sucesso.", goals=new_goals.to_dict())

@user_bp.route("/water/add", methods=["POST"])
@jwt_required()
def add_water():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    amount = data.get("amount")

    if not amount or not isinstance(amount, (int, float)) or amount <= 0:
        return jsonify({"error": "A quantidade de água deve ser um número positivo."}), 400

    try:
        total_today = user_service.add_water_intake(user_id=current_user_id, amount=amount)
        return jsonify({"message": "Água registrada!", "total": total_today}), 200
    except Exception as e:
        return jsonify({"error": "Erro interno ao registrar água."}), 500