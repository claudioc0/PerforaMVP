import logging

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.services import UserService
from app.models import User, WaterLog, WeightLog
from app.utils.pagination import get_pagination_params, paginate_query, pagination_meta

logger = logging.getLogger(__name__)

# O prefixo completo da API é definido aqui para manter o módulo autônomo.
user_bp = Blueprint("user_bp", __name__, url_prefix="/api/user")

# Singleton por módulo (uma instância pro processo inteiro) — mesmo padrão em
# workouts_routes.py. Critério: UserService não guarda estado próprio nem
# depende de app.config no __init__, então não há motivo pra reconstruir uma
# instância nova a cada request. MealService é a exceção (ver
# meals_routes.py): construir um GeminiService de verdade depende de
# app.config, que só existe dentro de um contexto de app/request — por isso
# usa uma fábrica chamada por request em vez de um singleton aqui.
user_service = UserService()

@user_bp.route("/goals", methods=["GET"])
@jwt_required()
def get_user_goals_route():
    user_id = int(get_jwt_identity())
    try:
        goals = user_service.get_user_goals(user_id)
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao buscar metas do usuário ID %s.", user_id)
        return jsonify({"error": "Erro interno ao buscar metas."}), 500

    if goals:
        return jsonify(goals.to_dict())
    # Se o usuário ainda não tem metas, retorna um objeto vazio para não quebrar o frontend.
    return jsonify({}), 200

@user_bp.route("/goals", methods=["PUT"])
@jwt_required()
def update_user_goals_route():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    try:
        updated_user = user_service.update_user_goals(user_id, data)
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao atualizar metas do usuário ID %s.", user_id)
        return jsonify({"error": "Erro interno ao atualizar metas."}), 500

    if not updated_user:
        return jsonify({"error": "Usuário não encontrado."}), 404
    return jsonify(message="Metas atualizadas com sucesso", goals=updated_user.goals.to_dict())

@user_bp.route("/calculate-goals", methods=["POST"])
@jwt_required()
def calculate_goals_route():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    try:
        # O user_service agora lida com o cálculo e a atualização
        new_goals = user_service.calculate_and_save_smart_goals(user_id, data)
    except ValueError as exc:
        # Dados físicos incompletos/inválidos (ver user_service.py) — erro de
        # requisição do cliente, não uma falha do servidor.
        return jsonify({"error": str(exc)}), 400
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao calcular metas do usuário ID %s.", user_id)
        return jsonify({"error": "Erro interno ao calcular metas."}), 500

    if not new_goals:
        return jsonify({"error": "Usuário não encontrado."}), 404
    return jsonify(message="Metas calculadas e salvas com sucesso.", goals=new_goals.to_dict())

@user_bp.route("/water/add", methods=["POST"])
@jwt_required()
def add_water():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
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
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao registrar água para o usuário ID %s.", current_user_id)
        return jsonify({"error": "Erro interno ao registrar água."}), 500
    
# --- ROTAS DE EVOLUÇÃO DE PESO ---

@user_bp.route("/weight", methods=["GET"])
@jwt_required()
def get_weight_history():
    current_user_id = int(get_jwt_identity())
    page, per_page = get_pagination_params()

    try:
        # Busca as pesagens mais recentes primeiro (pra paginar a partir do
        # presente, como qualquer histórico), depois inverte pra manter o
        # contrato de sempre: mais antiga → mais nova (o gráfico espera essa ordem).
        query = WeightLog.query.filter_by(user_id=current_user_id).order_by(WeightLog.log_date.desc(), WeightLog.id.desc())
        items, total = paginate_query(query, page, per_page)
        items.reverse()
    except Exception:
        logger.exception("Erro inesperado ao buscar histórico de peso do usuário ID %s.", current_user_id)
        return jsonify({"error": "Erro interno ao buscar histórico de peso."}), 500

    return jsonify({
        "items": [log.to_dict() for log in items],
        **pagination_meta(page, per_page, total),
    }), 200

@user_bp.route("/weight", methods=["POST"])
@jwt_required()
def log_weight():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    try:
        new_weight = float(data.get("weight", 0))
    except (TypeError, ValueError):
        # Antes, um valor não-numérico (ex: string "abc") derrubava float()
        # sem nenhum try/except — uma exceção não tratada que virava a
        # página HTML de erro 500 do Flask pra um client que só espera JSON.
        return jsonify({"error": "Peso inválido."}), 400

    if new_weight <= 0:
        return jsonify({"error": "Peso inválido."}), 400

    log = WeightLog(user_id=current_user_id, weight=new_weight)

    try:
        db.session.add(log)
        db.session.commit()
    except IntegrityError:
        # Já existe um registro de peso pra esse usuário nesse dia (constraint
        # uq_weight_logs_user_log_date) — não é uma falha de servidor, é um
        # duplicado que o próprio cliente pode evitar (editar o registro do
        # dia em vez de criar outro).
        db.session.rollback()
        return jsonify({"error": "Você já registrou seu peso hoje."}), 409
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao registrar peso do usuário ID %s.", current_user_id)
        return jsonify({"error": "Erro interno ao registrar peso."}), 500

    return jsonify({"message": "Peso registrado com sucesso!", "log": log.to_dict()}), 201