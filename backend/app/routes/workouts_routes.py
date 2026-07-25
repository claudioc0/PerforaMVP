import logging

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.services import WorkoutService, ExerciseService, SplitService

logger = logging.getLogger(__name__)

workouts_bp = Blueprint("workouts_bp", __name__, url_prefix="/api/workouts")

workout_service = WorkoutService()
exercise_service = ExerciseService()
split_service = SplitService()


# --- ROTAS DE TREINOS ---

@workouts_bp.route("", methods=["GET"])
@jwt_required()
def list_workouts():
    current_user_id = int(get_jwt_identity())
    workouts = workout_service.get_workouts_for_user(current_user_id)
    return jsonify([w.to_dict() for w in workouts]), 200


@workouts_bp.route("", methods=["POST"])
@jwt_required()
def create_workout():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    workout = workout_service.create_workout(current_user_id, data)
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
    exercises = exercise_service.search_exercises(query, muscle_group)
    return jsonify([e.to_dict() for e in exercises]), 200


@workouts_bp.route("/exercises", methods=["POST"])
@jwt_required()
def create_exercise():
    data = request.get_json()
    if not data or not data.get("name", "").strip():
        return jsonify({"error": "Campo 'name' é obrigatório."}), 400

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
