from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.services import UserService
from app.models import User, WaterLog, WeightLog
from app.utils.pagination import get_pagination_params, paginate_query, pagination_meta

# 1. CRIAÇÃO DO BLUEPRINT
# O prefixo completo da API é definido aqui para manter o módulo autônomo.
user_bp = Blueprint("user_bp", __name__, url_prefix="/api/user")

user_service = UserService()

@user_bp.route("/goals", methods=["GET"])
@jwt_required()
def get_user_goals_route():
    user_id = int(get_jwt_identity())
    goals = user_service.get_user_goals(user_id)
    
    if goals:
        return jsonify(goals.to_dict())
    # Se o usuário ainda não tem metas, retorna um objeto vazio para não quebrar o frontend.
    return jsonify({}), 200

@user_bp.route("/goals", methods=["PUT"])
@jwt_required()
def update_user_goals_route():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    updated_user = user_service.update_user_goals(user_id, data)
    return jsonify(message="Metas atualizadas com sucesso", goals=updated_user.goals.to_dict())

@user_bp.route("/calculate-goals", methods=["POST"])
@jwt_required()
def calculate_goals_route():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    # O user_service agora lida com o cálculo e a atualização
    new_goals = user_service.calculate_and_save_smart_goals(user_id, data)

    return jsonify(message="Metas calculadas e salvas com sucesso.", goals=new_goals.to_dict())

@user_bp.route("/water/add", methods=["POST"])
@jwt_required()
def add_water():
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    amount = data.get("amount")

    if not amount or not isinstance(amount, (int, float)) or amount <= 0:
        return jsonify({"error": "A quantidade de água deve ser um número positivo."}), 400

    try:
        total_today = user_service.add_water_intake(
            user_id=current_user_id,
            amount=amount,
            date_str=data.get("date"),
        )
        return jsonify({"message": "Água registrada!", "total": total_today}), 200
    except Exception as e:
        return jsonify({"error": "Erro interno ao registrar água."}), 500
    
# --- ROTAS DE EVOLUÇÃO DE PESO ---

@user_bp.route("/weight", methods=["GET"])
@jwt_required()
def get_weight_history():
    current_user_id = int(get_jwt_identity())
    page, per_page = get_pagination_params()

    # Busca as pesagens mais recentes primeiro (pra paginar a partir do
    # presente, como qualquer histórico), depois inverte pra manter o
    # contrato de sempre: mais antiga → mais nova (o gráfico espera essa ordem).
    query = WeightLog.query.filter_by(user_id=current_user_id).order_by(WeightLog.date.desc(), WeightLog.id.desc())
    items, total = paginate_query(query, page, per_page)
    items.reverse()

    return jsonify({
        "items": [log.to_dict() for log in items],
        **pagination_meta(page, per_page, total),
    }), 200

@user_bp.route("/weight", methods=["POST"])
@jwt_required()
def log_weight():
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    
    new_weight = float(data.get("weight", 0))
    if new_weight <= 0:
        return jsonify({"error": "Peso inválido"}), 400

    log = WeightLog(user_id=current_user_id, weight=new_weight)
    
    # Opcional: Atualiza também o peso atual do usuário na tabela Users se você tiver essa coluna
    # user = User.query.get(current_user_id)
    # user.current_weight = new_weight
    
    db.session.add(log)
    db.session.commit()
    
    return jsonify({"message": "Peso registrado com sucesso!", "log": log.to_dict()}), 201