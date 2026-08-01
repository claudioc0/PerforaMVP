import logging
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from sqlalchemy.exc import IntegrityError

from app.extensions import db, limiter, rate_limit_key_by_user
from app.models import FavoriteMeal
from app.services.gemini_service import (
    GeminiAnalysisError,
    GeminiRateLimitError,
    GeminiService,
    GeminiTimeoutError,
)
from app.services.meal_service import MealService
from app.services.food_cache_service import search_foods
from app.services.ai_quota_service import AiQuotaService
from app.utils.pagination import get_pagination_params, paginate_query, pagination_meta
from app.utils.file_uploads import is_allowed_image_file as _allowed_file

logger = logging.getLogger(__name__)

meals_bp = Blueprint("meals", __name__, url_prefix="/api/meals")

# Singleton por módulo — não guarda estado próprio nem depende de app.config
# no __init__ (mesmo critério de user_service/streak_service em user_routes.py).
ai_quota_service = AiQuotaService()

def _get_meal_service() -> MealService:
    # Diferente de user_routes.py/workouts_routes.py (singleton por módulo,
    # uma instância pro processo inteiro): MealService precisa ser construído
    # por request porque sua fábrica de GeminiService lê app.config, que só
    # existe dentro de um contexto de app/request — não dá pra montar isso
    # uma vez só, no import do módulo, como os outros services fazem.
    #
    # Passa uma fábrica, não uma instância pronta — a maioria das rotas que
    # usam MealService (salvar, listar, apagar, resumos) nunca chama a IA, e
    # construir um GeminiService (e o genai.Client interno) tem um custo real
    # que não faz sentido pagar em toda requisição. Só é construído de
    # verdade se `analyze_image`/`analyze_text` forem chamados (ver a
    # property `_gemini_service` em MealService).
    app = current_app._get_current_object()

    def _build_gemini_service() -> GeminiService:
        return GeminiService(
            api_key=app.config["GEMINI_API_KEY"],
            model_name=app.config["GEMINI_MODEL_NAME"],
            timeout_ms=app.config["GEMINI_TIMEOUT_MS"],
            retry_attempts=app.config["GEMINI_RETRY_ATTEMPTS"],
        )

    return MealService(_build_gemini_service)


# --- ROTA 1: APENAS ANALISA E DEVOLVE O RASCUNHO ---
@meals_bp.route("/analyze", methods=["POST"])
@jwt_required()
# Cada chamada aciona o Gemini (custo real por requisição). Sem isso, uma conta
# autenticada podia chamar em loop sem limite algum. Teto por usuário, não por IP.
@limiter.limit("10 per minute;60 per hour", key_func=rate_limit_key_by_user)
def analyze_meal():
    try:
        current_user_id = int(get_jwt_identity())
        quota = ai_quota_service.check_and_consume(current_user_id)
        if not quota["allowed"]:
            return jsonify({
                "error": "Você atingiu o limite de análises gratuitas hoje. Assine o Premium para análises ilimitadas.",
                "reason": "daily_quota_exceeded",
                "remaining": 0,
            }), 429

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
            draft_meal["ai_quota"] = {"remaining": quota["remaining"], "is_premium": quota["is_premium"]}
            return jsonify(draft_meal), 200 # Mudamos para 200 (OK) em vez de 201 (Created)

        json_data = request.get_json(silent=True) or {}
        form_data = request.form
        description = form_data.get("description") or json_data.get("description")

        if description:
            draft_meal = meal_service.analyze_text(description)
            draft_meal["ai_quota"] = {"remaining": quota["remaining"], "is_premium": quota["is_premium"]}
            return jsonify(draft_meal), 200

        return jsonify({"error": "Envie um campo 'image' ou 'description'."}), 400

    except GeminiRateLimitError as exc:
        # 429, não 422/500 — o cliente já sabe tratar esse status (ver
        # CameraScreen/ManualEntryScreen), sem precisar adivinhar pelo texto
        # da mensagem de erro.
        return jsonify({"error": str(exc)}), 429
    except GeminiTimeoutError as exc:
        # 504 (Gateway Timeout) — infraestrutura upstream não respondeu a
        # tempo, diferente de um 422 (a IA respondeu, mas o conteúdo não
        # servia).
        return jsonify({"error": str(exc)}), 504
    except GeminiAnalysisError as exc:
        logger.warning("Erro de análise da IA: %s", exc)
        return jsonify({"error": str(exc)}), 422
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao analisar refeição")
        return jsonify({"error": "Erro interno ao processar a refeição."}), 500


# --- ROTA: LÊ UMA FOTO DE RÓTULO/TABELA NUTRICIONAL (produto fora do OpenFoodFacts) ---
@meals_bp.route("/analyze-label", methods=["POST"])
@jwt_required()
@limiter.limit("10 per minute;60 per hour", key_func=rate_limit_key_by_user)
def analyze_label():
    try:
        current_user_id = int(get_jwt_identity())
        quota = ai_quota_service.check_and_consume(current_user_id)
        if not quota["allowed"]:
            return jsonify({
                "error": "Você atingiu o limite de análises gratuitas hoje. Assine o Premium para análises ilimitadas.",
                "reason": "daily_quota_exceeded",
                "remaining": 0,
            }), 429

        meal_service = _get_meal_service()

        if "image" not in request.files:
            return jsonify({"error": "Envie um campo 'image'."}), 400

        file = request.files["image"]
        if file.filename == "":
            return jsonify({"error": "Nenhum arquivo selecionado."}), 400
        if not _allowed_file(file.filename):
            return jsonify({"error": "Formato de arquivo não suportado."}), 400

        image_bytes = file.read()
        product = meal_service.analyze_label(image_bytes)
        product["ai_quota"] = {"remaining": quota["remaining"], "is_premium": quota["is_premium"]}
        return jsonify(product), 200

    except GeminiRateLimitError as exc:
        return jsonify({"error": str(exc)}), 429
    except GeminiTimeoutError as exc:
        return jsonify({"error": str(exc)}), 504
    except GeminiAnalysisError as exc:
        logger.warning("Erro de leitura do rótulo: %s", exc)
        return jsonify({"error": str(exc)}), 422
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao ler rótulo nutricional")
        return jsonify({"error": "Erro interno ao processar o rótulo."}), 500


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
        db.session.rollback()
        logger.exception("Erro inesperado ao salvar refeição confirmada")
        return jsonify({"error": "Erro interno ao salvar a refeição."}), 500


@meals_bp.route("/today", methods=["GET"])
@jwt_required()
def get_today():
    try:
        current_user_id = int(get_jwt_identity())

        meal_service = _get_meal_service()
        date_str = request.args.get("date")
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date() if date_str else datetime.utcnow().date() # type: ignore

        summary = meal_service.get_summary_for_date(target_date, current_user_id)
        
        return jsonify(summary), 200
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao buscar resumo do dia")
        return jsonify({"error": "Erro interno ao buscar o resumo."}), 500

# --- ROTAS DO CATÁLOGO DE ALIMENTOS ---

@meals_bp.route("/foods/search", methods=["GET"])
@jwt_required()
def search_foods_endpoint():
    query = request.args.get("q", "")
    results = search_foods(query)
    return jsonify(results), 200

# --- ROTAS DE FAVORITOS ---

@meals_bp.route("/favorites", methods=["GET"])
@jwt_required()
def get_favorites():
    current_user_id = int(get_jwt_identity())
    page, per_page = get_pagination_params()
    query = FavoriteMeal.query.filter_by(user_id=current_user_id).order_by(FavoriteMeal.id.desc())
    favorites, total = paginate_query(query, page, per_page)
    return jsonify({
        "items": [fav.to_dict() for fav in favorites],
        **pagination_meta(page, per_page, total),
    }), 200

@meals_bp.route("/favorites", methods=["POST"])
@jwt_required()
def add_favorite():
    current_user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    # Quando `items` vem preenchido (prato composto), os macros abaixo são só
    # um placeholder — o listener before_insert de FavoriteMeal (ver
    # favorite_meal.py) recalcula calories/protein_g/carbs_g/fat_g a partir da
    # soma dos itens antes de gravar, mesmo invariante já aplicado a Meal.
    items = data.get("items")
    try:
        new_favorite = FavoriteMeal(
            user_id=current_user_id,
            description=data.get("description"),
            calories=float(data.get("calories", 0)),
            protein_g=float(data.get("protein_g", 0)),
            carbs_g=float(data.get("carbs_g", 0)),
            fat_g=float(data.get("fat_g", 0)),
            items=items if items else None,
        )
    except (TypeError, ValueError):
        return jsonify({"error": "Valores nutricionais inválidos."}), 400

    try:
        db.session.add(new_favorite)
        db.session.commit()
    except IntegrityError:
        # Já existe um favorito com essa descrição pra esse usuário
        # (constraint uq_favorite_meals_user_description) — não é uma falha
        # de servidor, é uma tentativa de duplicar um favorito já existente.
        db.session.rollback()
        return jsonify({"error": "Essa refeição já está nos seus favoritos."}), 409
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao favoritar refeição para o usuário ID %s.", current_user_id)
        return jsonify({"error": "Erro interno ao favoritar a refeição."}), 500

    return jsonify({"message": "Refeição favoritada com sucesso!"}), 201

@meals_bp.route("/favorites/<int:fav_id>", methods=["DELETE"])
@jwt_required()
def remove_favorite(fav_id):
    current_user_id = int(get_jwt_identity())
    favorite = FavoriteMeal.query.get(fav_id)

    if not favorite or favorite.user_id != current_user_id:
        return jsonify({"error": "Favorito não encontrado."}), 404

    try:
        db.session.delete(favorite)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao remover favorito ID %s.", fav_id)
        return jsonify({"error": "Erro interno ao remover o favorito."}), 500

    return jsonify({"message": "Favorito removido."}), 200


@meals_bp.route("/weekly_summary", methods=["GET"])
@jwt_required()
def get_weekly_summary_endpoint():
    try:
        current_user_id = int(get_jwt_identity())
        meal_service = _get_meal_service()
        today_str = request.args.get("today")
        summary = meal_service.get_weekly_summary(current_user_id, today_str)
        return jsonify(summary), 200
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao buscar resumo semanal")
        return jsonify({"error": "Erro interno ao buscar o resumo semanal."}), 500


@meals_bp.route("/<int:meal_id>", methods=["PUT"])
@jwt_required()
def update_meal(meal_id: int):
    try:
        current_user_id = int(get_jwt_identity())
        meal_service = _get_meal_service()
        data = request.get_json()

        if not data:
            return jsonify({"error": "Nenhum dado fornecido para atualização."}), 400

        updated_meal = meal_service.update_meal(meal_id, current_user_id, data)

        if updated_meal:
            return jsonify(updated_meal.to_dict()), 200
        return jsonify({"error": "Refeição não encontrada ou não pertence ao usuário."}), 404
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao atualizar refeição")
        return jsonify({"error": "Erro interno ao atualizar a refeição."}), 500

@meals_bp.route("/<int:meal_id>", methods=["DELETE"])
@jwt_required()
def delete_meal(meal_id: int):
    try:
        current_user_id = int(get_jwt_identity())
        meal_service = _get_meal_service()

        # O service irá verificar se a refeição pertence ao usuário antes de apagar
        success = meal_service.delete_meal_by_id(meal_id, current_user_id)

        if success:
            return jsonify({"message": "Refeição apagada com sucesso."}), 200
        return jsonify({"error": "Refeição não encontrada ou não pertence ao usuário."}), 404
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao apagar refeição")
        return jsonify({"error": "Erro interno ao apagar a refeição."}), 500
    
@meals_bp.route("/daily-insight", methods=["POST"])
@jwt_required()
@limiter.limit("10 per hour", key_func=rate_limit_key_by_user)
def daily_insight():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Nenhum dado fornecido."}), 400

        goals = data.get("goals", {})
        consumed = data.get("consumed", {})
        language = data.get("language", "pt")

        meal_service = _get_meal_service()
        insight_text = meal_service.generate_daily_insight(goals, consumed, language)
        
        return jsonify({"insight": insight_text}), 200
    except Exception:
        db.session.rollback()
        logger.exception("Erro inesperado ao gerar insight diário")
        return jsonify({"error": "Erro interno ao gerar o insight."}), 500

@meals_bp.route("/health", methods=["GET"])
# A rota de health_check NÃO precisa de @jwt_required, ela é pública para o servidor saber se a API está viva.
def health_check():
    # Antes isso devolvia "ok" sem checar nada — uma queda total do banco
    # (arquivo do SQLite corrompido, Postgres fora do ar) ficava verde aqui
    # enquanto toda rota de verdade quebrava. SELECT 1 é a checagem mais
    # barata que ainda força uma ida real ao banco.
    try:
        db.session.execute(db.text("SELECT 1"))
    except Exception:
        db.session.rollback()
        logger.exception("Health check: banco de dados inacessível")
        return jsonify({"status": "error", "service": "nutrition-meals-service", "error": "Banco de dados inacessível."}), 503

    return jsonify({"status": "ok", "service": "nutrition-meals-service"}), 200