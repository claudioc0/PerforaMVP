import logging
import random
import re

from app.extensions import db
from app.models import FoodCache

logger = logging.getLogger(__name__)

# Grava só uma amostra dos hits (o resto do tempo, some sem gravar nada) —
# alimentos populares ("arroz", "frango") são lidos MUITO mais do que o
# necessário pra manter uma contagem só aproximada, e cada gravação é um
# UPDATE na mesma linha, virando um ponto de contenção de escrita sob
# concorrência. hit_count só serve pra ordenar por popularidade na busca
# (não precisa ser exato), então multiplicamos o incremento pelo inverso da
# taxa de amostragem — a MÉDIA do contador continua correta no longo prazo,
# só a variância aumenta um pouco.
HIT_COUNT_SAMPLE_RATE = 0.1
HIT_COUNT_INCREMENT = round(1 / HIT_COUNT_SAMPLE_RATE)


def _normalize(text: str) -> str:
    """strip + lower + colapsa espaços múltiplos — maximiza a chance de bater no cache."""
    return re.sub(r"\s+", " ", text.strip().lower())


_LIKE_ESCAPE_CHAR = "\\"


def _escape_like_wildcards(value: str) -> str:
    """Escapa os coringas do LIKE (`%`, `_`) pra tratar o termo buscado como
    texto literal, não como padrão — sem isso, um alimento com "%" ou "_" no
    nome (ex: "leite 0% gordura") faria o LIKE casar coisas que a pessoa
    nunca pediu pra buscar."""
    return (
        value.replace(_LIKE_ESCAPE_CHAR, _LIKE_ESCAPE_CHAR * 2)
        .replace("%", _LIKE_ESCAPE_CHAR + "%")
        .replace("_", _LIKE_ESCAPE_CHAR + "_")
    )


def get_cached_or_fetch_macros(description: str, fresh_macros: dict) -> dict:
    """Garante consistência nutricional entre análises do mesmo alimento.

    Não evita a chamada ao Gemini — a foto/descrição já foi analisada antes desta
    função ser chamada (não tem como saber o que tem numa imagem sem "olhar" pra
    ela). O ganho aqui é outro: se "banana" já foi vista antes (por qualquer
    usuário), usamos os macros salvos em vez de confiar de novo na estimativa
    fresca da IA, que pode variar levemente entre chamadas mesmo pro mesmo
    alimento. Na primeira vez que um alimento aparece, a estimativa da IA vira
    a referência salva.

    Args:
        description: nome do alimento identificado pela IA (ex: "Banana").
        fresh_macros: {"calories", "protein_g", "carbs_g", "fat_g"} por 100g,
            conforme retornado pela IA nesta análise.

    Returns:
        Os macros por 100g a usar — os salvos em cache (hit) ou os frescos (miss).
    """
    search_query = _normalize(description)

    cached = FoodCache.query.filter_by(search_query=search_query).first()

    if cached:
        needs_write = False

        if random.random() < HIT_COUNT_SAMPLE_RATE:
            cached.hit_count += HIT_COUNT_INCREMENT
            needs_write = True

        if not cached.name or cached.name == search_query:
            # Cura o nome de exibição de entradas antigas (backfill ou pré-coluna
            # `name`) assim que o alimento reaparece com o nome original da IA.
            # Sempre acontece quando necessário — independe da amostragem acima,
            # que é só sobre o contador de popularidade.
            cached.name = description.strip()
            needs_write = True

        # Fora da amostra e com o nome já correto: nenhum atributo foi
        # alterado, então não há nada pendente — pular o commit é
        # exatamente o ponto desta otimização (menos UPDATEs na mesma linha).
        if needs_write:
            db.session.commit()

        return {
            "calories": cached.calories,
            "protein_g": cached.protein_g,
            "carbs_g": cached.carbs_g,
            "fat_g": cached.fat_g,
        }

    new_entry = FoodCache(
        search_query=search_query,
        name=description.strip(),
        calories=fresh_macros["calories"],
        protein_g=fresh_macros["protein_g"],
        carbs_g=fresh_macros["carbs_g"],
        fat_g=fresh_macros["fat_g"],
    )
    db.session.add(new_entry)
    try:
        db.session.commit()
    except Exception:
        # Corrida rara: duas análises com o mesmo alimento novo ao mesmo tempo,
        # ambas tentando criar a mesma search_query (unique constraint). Não é
        # crítico — simplesmente não guarda essa cópia, o valor fresco da IA
        # ainda é retornado normalmente pro usuário.
        db.session.rollback()
        logger.warning("Corrida ao gravar FoodCache para '%s' — seguindo sem cache.", search_query)

    return fresh_macros


def _serialize_food(item: FoodCache) -> dict:
    return {
        "id": item.id,
        "name": item.name or item.search_query.title(),
        "calories": item.calories,
        "protein_g": item.protein_g,
        "carbs_g": item.carbs_g,
        "fat_g": item.fat_g,
    }


def search_foods(query: str, limit: int = 20) -> list:
    """Busca alimentos no catálogo (FoodCache) por nome.

    Cresce organicamente a cada análise da IA (imagem ou texto) — nenhum
    alimento precisa ser cadastrado manualmente pra aparecer aqui depois da
    primeira vez que alguém o registra. Ordenado por popularidade (hit_count)
    pra alimentos mais usados aparecerem primeiro, como num app de referência
    tipo MyFitnessPal.

    Duas etapas: primeiro busca por PREFIXO (`termo%`), que usa o índice em
    search_query (uma busca por substring com `%termo%` não usa índice
    nenhum — vira uma varredura completa da tabela a cada tecla digitada, e
    essa tabela só cresce). A maioria das buscas digita do início do nome do
    alimento (ex: "fran" → "Frango Grelhado"), então isso já cobre o caso
    comum de forma rápida. Só completa com uma busca por substring (sem
    índice) se o prefixo não trouxe resultados suficientes — cobre o caso
    raro de buscar uma palavra no meio do nome (ex: "grelhado"), sem pagar o
    custo da varredura completa em toda busca.

    O padrão de prefixo é montado como UM literal só (`"termo%"`), não via
    `.startswith()` — esse método do SQLAlchemy compila pra
    `LIKE ? || '%'` (concatenação em SQL), e o otimizador do SQLite só
    reconhece a busca por prefixo como aproveitável pelo índice quando o
    padrão inteiro é um literal único, não uma expressão computada.
    """
    normalized_query = _normalize(query)
    if not normalized_query:
        return []

    prefix_pattern = _escape_like_wildcards(normalized_query) + "%"
    prefix_results = (
        FoodCache.query
        .filter(FoodCache.search_query.like(prefix_pattern, escape=_LIKE_ESCAPE_CHAR))
        .order_by(FoodCache.hit_count.desc(), FoodCache.search_query)
        .limit(limit)
        .all()
    )

    combined = {item.id: item for item in prefix_results}

    if len(combined) < limit:
        substring_results = (
            FoodCache.query
            .filter(FoodCache.search_query.contains(normalized_query))
            .order_by(FoodCache.hit_count.desc(), FoodCache.search_query)
            .limit(limit)
            .all()
        )
        for item in substring_results:
            if len(combined) >= limit:
                break
            combined.setdefault(item.id, item)

    return [_serialize_food(item) for item in combined.values()]
