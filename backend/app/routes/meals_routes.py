import logging
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
# NOVAS IMPORTAÇÕES DO JWT
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.services.gemini_service import GeminiAnalysisError, GeminiService
from app.services.meal_service import MealService

logger = logging.getLogger(__name__)

meals_bp = Blueprint("meals", __name__, url_prefix="/api/meals")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _get_meal_service() -> MealService:
    gemini_service = GeminiService(
        api_key=current_app.config["GEMINI_API_KEY"],
        model_name=current_app.config["GEMINI_MODEL_NAME"], 
    )
    return MealService(gemini_service)


@meals_bp.route("/analyze", methods=["POST"])
@jwt_required() # <--- TRAVA DE SEGURANÇA ADICIONADA
def analyze_meal():
    try:
        # Pega a identidade (ID) do usuário de dentro do Token JWT
        current_user_id = int(get_jwt_identity())
        meal_service = _get_meal_service()

        if "image" in request.files:
            file = request.files["image"]
            if file.filename == "":
                return jsonify({"error": "Nenhum arquivo selecionado."}), 400
            if not _allowed_file(file.filename):
                return jsonify({"error": "Formato de arquivo não suportado."}), 400

            date_str = request.form.get("date")
            image_bytes = file.read()
            
            # ATENÇÃO: Passando o current_user_id para o service
            meal = meal_service.analyze_and_store_image(image_bytes, date_str, current_user_id)
            return jsonify(meal.to_dict()), 201

        json_data = request.get_json(silent=True) or {}
        form_data = request.form

        description = form_data.get("description") or json_data.get("description")
        date_str = form_data.get("date") or json_data.get("date")

        if description:
            # ATENÇÃO: Passando o current_user_id para o service
            meal = meal_service.analyze_and_store_text(description, date_str, current_user_id)
            return jsonify(meal.to_dict()), 201

        return jsonify({"error": "Envie um campo 'image' ou 'description'."}), 400

    except GeminiAnalysisError as exc:
        logger.warning("Erro de análise da IA: %s", exc)
        return jsonify({"error": str(exc)}), 422
    except ValueError as exc:
        logger.error("Erro de configuração: %s", exc)
        return jsonify({"error": "Erro de configuração do servidor."}), 500
    except Exception:
        logger.exception("Erro inesperado ao analisar refeição")
        return jsonify({"error": "Erro interno ao processar a refeição."}), 500


@meals_bp.route("/today", methods=["GET"]) # (Você pode renomear para /daily_summary depois)
@jwt_required() # <--- TRAVA DE SEGURANÇA ADICIONADA
def get_today():
    try:
        # Pega a identidade (ID) do usuário de dentro do Token JWT
        current_user_id = int(get_jwt_identity())
        
        meal_service = _get_meal_service()
        date_str = request.args.get("date")
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date()
        
        # ATENÇÃO: Passando o current_user_id para o service filtrar o banco
        summary = meal_service.get_summary_for_date(target_date, current_user_id)
        
        return jsonify(summary), 200
    except Exception:
        logger.exception("Erro inesperado ao buscar resumo do dia")
        return jsonify({"error": "Erro interno ao buscar o resumo."}), 500


@meals_bp.route("/health", methods=["GET"])
# A rota de health_check NÃO precisa de @jwt_required, ela é pública para o servidor saber se a API está viva.
def health_check():
    return jsonify({"status": "ok", "service": "nutrition-meals-service"}), 200