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


# --- ROTA 1: APENAS ANALISA E DEVOLVE O RASCUNHO ---
@meals_bp.route("/analyze", methods=["POST"])
@jwt_required()
def analyze_meal():
    try:
        meal_service = _get_meal_service()

        if "image" in request.files:
            file = request.files["image"]
            if file.filename == "":
                return jsonify({"error": "Nenhum arquivo selecionado."}), 400
            if not _allowed_file(file.filename):
                return jsonify({"error": "Formato de arquivo não suportado."}), 400

            image_bytes = file.read()
            # Retorna a estimativa sem o current_user_id, pois não vai pro banco agora
            draft_meal = meal_service.analyze_image(image_bytes)
            return jsonify(draft_meal), 200 # Mudamos para 200 (OK) em vez de 201 (Created)

        json_data = request.get_json(silent=True) or {}
        form_data = request.form
        description = form_data.get("description") or json_data.get("description")

        if description:
            draft_meal = meal_service.analyze_text(description)
            return jsonify(draft_meal), 200

        return jsonify({"error": "Envie um campo 'image' ou 'description'."}), 400

    except GeminiAnalysisError as exc:
        logger.warning("Erro de análise da IA: %s", exc)
        return jsonify({"error": str(exc)}), 422
    except Exception:
        logger.exception("Erro inesperado ao analisar refeição")
        return jsonify({"error": "Erro interno ao processar a refeição."}), 500


# --- ROTA 2: NOVA ROTA PARA SALVAR APÓS CONFIRMAÇÃO ---
@meals_bp.route("/save", methods=["POST"])
@jwt_required()
def save_meal_endpoint():
    try:
        current_user_id = int(get_jwt_identity())
        meal_service = _get_meal_service()
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "Nenhum dado fornecido."}), 400
            
        date_str = data.get("date")
        
        # Passa o pacote de dados confirmado, a data e o ID do usuário para salvar
        saved_meal = meal_service.save_meal(data, date_str, current_user_id)
        
        return jsonify(saved_meal.to_dict()), 201 # 201 (Created) porque agora sim foi pro banco
        
    except Exception:
        logger.exception("Erro inesperado ao salvar refeição confirmada")
        return jsonify({"error": "Erro interno ao salvar a refeição."}), 500


@meals_bp.route("/today", methods=["GET"]) # (Você pode renomear para /daily_summary depois)
@jwt_required() # <--- TRAVA DE SEGURANÇA ADICIONADA
def get_today():
    try:
        # Pega a identidade (ID) do usuário de dentro do Token JWT
        current_user_id = int(get_jwt_identity())
        
        meal_service = _get_meal_service()
        date_str = request.args.get("date")
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date() # type: ignore
        
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