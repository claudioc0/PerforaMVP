from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.user import User
from app.extensions import db

user_bp = Blueprint("user", __name__, url_prefix="/api/user")

@user_bp.route("/goals", methods=["GET", "PUT"])
@jwt_required()
def handle_goals():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({"error": "Usuário não encontrado."}), 404

    # Se for GET, apenas devolve as metas atuais
    if request.method == "GET":
        return jsonify({
            "goal_calories": user.goal_calories,
            "goal_protein_g": user.goal_protein_g,
            "goal_carbs_g": user.goal_carbs_g,
            "goal_fat_g": user.goal_fat_g
        }), 200

    # Se for PUT, atualiza as metas com os dados enviados pelo celular
    if request.method == "PUT":
        data = request.get_json()
        
        # Atualiza os valores se eles vierem no JSON, senão mantém o atual
        user.goal_calories = float(data.get("goal_calories", user.goal_calories))
        user.goal_protein_g = float(data.get("goal_protein_g", user.goal_protein_g))
        user.goal_carbs_g = float(data.get("goal_carbs_g", user.goal_carbs_g))
        user.goal_fat_g = float(data.get("goal_fat_g", user.goal_fat_g))

        db.session.commit()
        return jsonify({"message": "Metas atualizadas com sucesso!"}), 200