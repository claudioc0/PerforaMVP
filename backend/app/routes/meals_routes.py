import logging

from flask import Blueprint, current_app, jsonify, request

from app.services.gemini_service import GeminiAnalysisError, GeminiService
from app.services.meal_service import MealService

logger = logging.getLogger(__name__)

meals_bp = Blueprint("meals", __name__, url_prefix="/api/meals")

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _get_meal_service() -> MealService:
    """Cria o MealService sob demanda, usando a config do app atual."""
    gemini_service = GeminiService(
        api_key=current_app.config["GEMINI_API_KEY"],
        model_name=current_app.config["GEMINI_MODEL_NAME"], 
    )
    return MealService(gemini_service)


@meals_bp.route("/analyze", methods=["POST"])
def analyze_meal():
    """
    Recebe uma imagem (multipart/form-data, campo 'image') OU um texto
    (form-data ou JSON, campo 'description') e retorna os macros extraídos
    pela IA, já persistidos no banco.
    """
    try:
        meal_service = _get_meal_service()

        # Caso 1: imagem enviada via multipart/form-data
        if "image" in request.files:
            file = request.files["image"]
            if file.filename == "":
                return jsonify({"error": "Nenhum arquivo selecionado."}), 400
            if not _allowed_file(file.filename):
                return jsonify({"error": "Formato de arquivo não suportado."}), 400

            image_bytes = file.read()
            meal = meal_service.analyze_and_store_image(image_bytes)
            return jsonify(meal.to_dict()), 201

        # Caso 2: descrição em texto (form-data ou JSON)
        description = request.form.get("description") or (
            request.get_json(silent=True) or {}
        ).get("description")

        if description:
            meal = meal_service.analyze_and_store_text(description)
            return jsonify(meal.to_dict()), 201

        return jsonify({"error": "Envie um campo 'image' ou 'description'."}), 400

    except GeminiAnalysisError as exc:
        logger.warning("Erro de análise da IA: %s", exc)
        return jsonify({"error": str(exc)}), 422
    except ValueError as exc:
        # ex: GEMINI_API_KEY ausente
        logger.error("Erro de configuração: %s", exc)
        return jsonify({"error": "Erro de configuração do servidor."}), 500
    except Exception:
        logger.exception("Erro inesperado ao analisar refeição")
        return jsonify({"error": "Erro interno ao processar a refeição."}), 500


@meals_bp.route("/today", methods=["GET"])
def get_today():
    """Retorna o histórico e o somatório de macros consumidos no dia atual."""
    summary = MealService.get_today_summary()
    return jsonify(summary), 200


@meals_bp.route("/health", methods=["GET"])
def health_check():
    """Endpoint simples de saúde do microserviço, útil para orquestração/monitoramento."""
    return jsonify({"status": "ok", "service": "nutrition-meals-service"}), 200
