import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import limiter, rate_limit_key_by_user
from app.services import WorkoutService, ExerciseService, SplitService, WeeklyPlanService
from app.utils.pagination import get_pagination_params, pagination_meta

logger = logging.getLogger(__name__)

workouts_bp = Blueprint("workouts_bp", __name__, url_prefix="/api/workouts")

workout_service = WorkoutService()
exercise_service = ExerciseService()
split_service = SplitService()
weekly_plan_service = WeeklyPlanService()


# --- ROTAS DE TREINOS ---

@workouts_bp.route("", methods=["GET"])
@jwt_required()
def list_workouts():
    current_user_id = int(get_jwt_identity())
    page, per_page = get_pagination_params()
    workouts, total = workout_service.get_workouts_for_user(current_user_id, page, per_page)
    return jsonify({
        "items": [w.to_dict() for w in workouts],
        **pagination_meta(page, per_page, total),
    }), 200


@workouts_bp.route("", methods=["POST"])
@jwt_required()
def create_workout():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    workout = workout_service.create_workout(current_user_id, data)
    if not workout:
        return jsonify({"error": "Erro interno ao criar o treino."}), 500
    return jsonify(workout.to_dict()), 201


@workouts_bp.route("/<int:workout_id>", methods=["GET"])
@jwt_required()
def get_workout(workout_id: int):
    current_user_id = int(get_jwt_identity())
    detail = workout_service.get_workout_detail(workout_id, current_user_id)
    if detail:
        return jsonify(detail), 200
    return jsonify({"error": "Treino não encontrado ou não pertence ao usuário."}), 404


@workouts_bp.route("/<int:workout_id>", methods=["PUT"])
@jwt_required()
def update_workout(workout_id: int):
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data:
        return jsonify({"error": "Nenhum dado fornecido para atualização."}), 400

    workout = workout_service.update_workout(workout_id, current_user_id, data)
    if workout:
        return jsonify(workout.to_dict()), 200
    return jsonify({"error": "Treino não encontrado ou não pertence ao usuário."}), 404


@workouts_bp.route("/<int:workout_id>", methods=["DELETE"])
@jwt_required()
def delete_workout(workout_id: int):
    current_user_id = int(get_jwt_identity())
    success = workout_service.delete_workout(workout_id, current_user_id)
    if success:
        return jsonify({"message": "Treino apagado com sucesso."}), 200
    return jsonify({"error": "Treino não encontrado ou não pertence ao usuário."}), 404


# --- ROTAS DE SÉRIES ---

@workouts_bp.route("/<int:workout_id>/sets", methods=["POST"])
@jwt_required()
def add_set(workout_id: int):
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data or not data.get("exercise_id"):
        return jsonify({"error": "Campo 'exercise_id' é obrigatório."}), 400

    set_log = workout_service.add_set(workout_id, current_user_id, data)
    if set_log:
        return jsonify(set_log.to_dict()), 201
    return jsonify({"error": "Treino não encontrado ou não pertence ao usuário."}), 404


@workouts_bp.route("/<int:workout_id>/sets/<int:set_id>", methods=["PUT"])
@jwt_required()
def update_set(workout_id: int, set_id: int):
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data:
        return jsonify({"error": "Nenhum dado fornecido para atualização."}), 400

    set_log = workout_service.update_set(workout_id, set_id, current_user_id, data)
    if set_log:
        return jsonify(set_log.to_dict()), 200
    return jsonify({"error": "Série não encontrada ou não pertence ao usuário."}), 404


@workouts_bp.route("/<int:workout_id>/sets/<int:set_id>", methods=["DELETE"])
@jwt_required()
def delete_set(workout_id: int, set_id: int):
    current_user_id = int(get_jwt_identity())
    success = workout_service.delete_set(workout_id, set_id, current_user_id)
    if success:
        return jsonify({"message": "Série apagada com sucesso."}), 200
    return jsonify({"error": "Série não encontrada ou não pertence ao usuário."}), 404


# --- ROTAS DO CATÁLOGO DE EXERCÍCIOS ---

@workouts_bp.route("/exercises", methods=["GET"])
@jwt_required()
def list_exercises():
    query = request.args.get("search")
    muscle_group = request.args.get("muscle_group")
    page, per_page = get_pagination_params()
    exercises, total = exercise_service.search_exercises(page, per_page, query, muscle_group)
    return jsonify({
        "items": [e.to_dict() for e in exercises],
        **pagination_meta(page, per_page, total),
    }), 200


@workouts_bp.route("/exercises", methods=["POST"])
@jwt_required()
# O catálogo é global — todo usuário compartilha o mesmo. Sem teto por conta,
# uma única conta em loop poderia poluir o picker de exercícios de todo mundo.
@limiter.limit("20 per hour", key_func=rate_limit_key_by_user)
def create_exercise():
    data = request.get_json(silent=True) or {}

    errors = exercise_service.validate_custom_exercise_data(data)
    if errors:
        return jsonify({"error": "Dados inválidos.", "details": errors}), 400

    exercise = exercise_service.create_custom_exercise(data)
    return jsonify(exercise.to_dict()), 201


# --- ROTAS DE PROGRESSO ---

@workouts_bp.route("/exercises/<int:exercise_id>/history", methods=["GET"])
@jwt_required()
def get_exercise_history(exercise_id: int):
    current_user_id = int(get_jwt_identity())
    limit = request.args.get("limit", type=int)
    history = workout_service.get_exercise_history(exercise_id, current_user_id, limit)
    return jsonify(history), 200


@workouts_bp.route("/progress", methods=["GET"])
@jwt_required()
def get_workout_progress():
    current_user_id = int(get_jwt_identity())
    limit = request.args.get("limit", type=int) or 10
    progress = workout_service.get_workout_progress(current_user_id, limit)
    return jsonify(progress), 200


# --- ROTAS DE DIVISÕES DE TREINO (SPLITS) ---

@workouts_bp.route("/splits", methods=["GET"])
@jwt_required()
def list_splits():
    splits = split_service.list_splits()
    return jsonify(splits), 200


@workouts_bp.route("/splits/days/<int:day_id>/exercises", methods=["GET"])
@jwt_required()
def get_split_day_exercises(day_id: int):
    exercises = split_service.get_day_exercises(day_id)
    return jsonify(exercises), 200


# --- ROTAS DO PLANO SEMANAL (SEGUNDA A DOMINGO) ---

@workouts_bp.route("/weekly-plan", methods=["GET"])
@jwt_required()
def get_weekly_plan():
    current_user_id = int(get_jwt_identity())
    plan = weekly_plan_service.get_plan(current_user_id)
    if plan:
        return jsonify({"has_plan": True, **plan}), 200
    return jsonify({"has_plan": False}), 200


@workouts_bp.route("/weekly-plan", methods=["POST"])
@jwt_required()
def create_weekly_plan():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    split_id = data.get("split_id")
    split_day_ids = data.get("split_day_ids")

    if not split_id:
        return jsonify({"error": "Campo 'split_id' é obrigatório."}), 400
    if split_day_ids is not None and (not isinstance(split_day_ids, list) or not split_day_ids or len(split_day_ids) > 7):
        return jsonify({"error": "'split_day_ids' deve ser uma lista de 1 a 7 IDs de dias da divisão."}), 400

    plan = weekly_plan_service.create_or_replace_plan(current_user_id, split_id, split_day_ids)
    if plan:
        return jsonify({"has_plan": True, **plan}), 201
    return jsonify({"error": "Divisão não encontrada, ou os dias informados não pertencem a ela."}), 404


@workouts_bp.route("/weekly-plan", methods=["DELETE"])
@jwt_required()
def delete_weekly_plan():
    current_user_id = int(get_jwt_identity())
    success = weekly_plan_service.delete_plan(current_user_id)
    if success:
        return jsonify({"message": "Plano semanal apagado com sucesso."}), 200
    return jsonify({"error": "Nenhum plano semanal encontrado."}), 404


@workouts_bp.route("/weekly-plan/days/<int:day_of_week>", methods=["PUT"])
@jwt_required()
def update_weekly_plan_day(day_of_week: int):
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    split_day_id = data.get("split_day_id")

    plan = weekly_plan_service.update_day(current_user_id, day_of_week, split_day_id)
    if plan:
        return jsonify({"has_plan": True, **plan}), 200
    return jsonify({"error": "Plano semanal ou dia não encontrado, ou o dia não pertence à divisão do plano."}), 404
