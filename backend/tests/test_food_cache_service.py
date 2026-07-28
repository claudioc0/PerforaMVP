"""Regressão: cache de alimento não pode virar ponto de contenção de escrita.

Antes, todo "cache hit" (alimento já visto por qualquer usuário) disparava um
UPDATE + commit pra incrementar hit_count — alimentos populares ("arroz",
"frango") acumulam muito mais hits do que qualquer outro registro, então
cada leitura popular virava uma escrita na MESMA linha, serializando sob
concorrência. Agora só uma amostra dos hits é gravada (o resto simplesmente
não grava nada), com o incremento multiplicado pra manter a média do
contador correta no longo prazo — hit_count só serve pra ordenar por
popularidade, não precisa ser exato.

A busca por alimentos (search_foods) também virava uma varredura completa a
cada tecla digitada (`LIKE '%termo%'` não usa índice nenhum). Agora tenta
primeiro por PREFIXO (usa o índice), só caindo pra substring sem índice
quando o prefixo não é suficiente.
"""
from unittest.mock import patch

from app.extensions import db
from app.models import FoodCache
from app.services.food_cache_service import (
    HIT_COUNT_INCREMENT,
    get_cached_or_fetch_macros,
    search_foods,
)


def _make_cached_food(search_query="arroz", name="Arroz", hit_count=1):
    entry = FoodCache(
        search_query=search_query, name=name,
        calories=130, protein_g=2.7, carbs_g=28, fat_g=0.3,
        hit_count=hit_count,
    )
    db.session.add(entry)
    db.session.commit()
    return entry


class TestAmostragemDoHitCount:
    def test_fora_da_amostra_e_com_nome_correto_nao_gera_commit(self, app):
        with app.app_context():
            _make_cached_food()

            with patch("app.services.food_cache_service.random.random", return_value=0.999):
                with patch.object(db.session, "commit", wraps=db.session.commit) as commit_spy:
                    get_cached_or_fetch_macros("Arroz", {"calories": 999, "protein_g": 1, "carbs_g": 1, "fat_g": 1})
                    commit_spy.assert_not_called()

    def test_dentro_da_amostra_incrementa_pelo_fator_de_correcao(self, app):
        with app.app_context():
            _make_cached_food(hit_count=10)

            with patch("app.services.food_cache_service.random.random", return_value=0.0):
                get_cached_or_fetch_macros("Arroz", {"calories": 999, "protein_g": 1, "carbs_g": 1, "fat_g": 1})

            cached = FoodCache.query.filter_by(search_query="arroz").first()
            assert cached.hit_count == 10 + HIT_COUNT_INCREMENT

    def test_backfill_de_nome_sempre_acontece_independente_da_amostra(self, app):
        """Uma entrada antiga sem nome de exibição (ou com o nome igual à
        chave normalizada) precisa ser corrigida assim que reaparece — isso
        não pode depender de cair na amostra do hit_count."""
        with app.app_context():
            _make_cached_food(search_query="banana prata", name="banana prata")

            with patch("app.services.food_cache_service.random.random", return_value=0.999):
                get_cached_or_fetch_macros(
                    "Banana Prata", {"calories": 90, "protein_g": 1, "carbs_g": 20, "fat_g": 0}
                )

            cached = FoodCache.query.filter_by(search_query="banana prata").first()
            assert cached.name == "Banana Prata"

    def test_cache_continua_devolvendo_os_macros_salvos_independente_da_amostra(self, app):
        with app.app_context():
            _make_cached_food()

            with patch("app.services.food_cache_service.random.random", return_value=0.999):
                macros = get_cached_or_fetch_macros(
                    "Arroz", {"calories": 999, "protein_g": 999, "carbs_g": 999, "fat_g": 999}
                )

            assert macros["calories"] == 130


class TestBuscaDeAlimentosPorPrefixo:
    def test_prefixo_usa_o_indice_em_vez_de_scan(self, app):
        """Reproduz exatamente a consulta que search_foods monta pro passo de
        prefixo — não usa .startswith() direto aqui, porque ele compila pra
        `LIKE ? || '%'` (concatenação em SQL) e o SQLite só usa o índice
        quando o padrão inteiro é um literal único (ver _escape_like_wildcards
        em food_cache_service.py)."""
        from sqlalchemy import text
        from app.services.food_cache_service import _escape_like_wildcards, _LIKE_ESCAPE_CHAR

        with app.app_context():
            _make_cached_food(search_query="frango grelhado", name="Frango Grelhado")

            pattern = _escape_like_wildcards("fran") + "%"
            query = FoodCache.query.filter(FoodCache.search_query.like(pattern, escape=_LIKE_ESCAPE_CHAR))
            compiled = query.statement.compile(dialect=db.engine.dialect, compile_kwargs={"literal_binds": True})
            plan = " | ".join(
                str(row) for row in db.session.execute(text(f"EXPLAIN QUERY PLAN {compiled}")).fetchall()
            )
            assert "ix_food_cache_search_query" in plan
            assert "SCAN" not in plan.upper()

    def test_busca_por_prefixo_encontra_o_alimento(self, app):
        with app.app_context():
            _make_cached_food(search_query="frango grelhado", name="Frango Grelhado")
            _make_cached_food(search_query="feijao carioca", name="Feijão Carioca")

            results = search_foods("fran")
            assert [r["name"] for r in results] == ["Frango Grelhado"]

    def test_busca_por_palavra_no_meio_do_nome_cai_no_fallback_de_substring(self, app):
        """"grelhado" não é prefixo de "frango grelhado" — só aparece via
        fallback de substring, provando que a busca continua encontrando
        isso mesmo não sendo o caminho rápido (indexado)."""
        with app.app_context():
            _make_cached_food(search_query="frango grelhado", name="Frango Grelhado")

            results = search_foods("grelhado")
            assert [r["name"] for r in results] == ["Frango Grelhado"]

    @staticmethod
    def _capture_queries(fn, *args, **kwargs):
        from sqlalchemy import event

        queries = []

        def _log(conn, cursor, statement, parameters, context, executemany):
            queries.append(statement)

        event.listen(db.engine, "before_cursor_execute", _log)
        try:
            result = fn(*args, **kwargs)
        finally:
            event.remove(db.engine, "before_cursor_execute", _log)
        return result, queries

    def test_primeira_query_e_a_de_prefixo_com_escape_um_unico_literal(self, app):
        """A consulta que search_foods emite primeiro precisa ser a de
        prefixo — reconhecível pela cláusula ESCAPE (só existe na forma de
        literal único que o SQLite consegue casar com o índice; a forma
        antiga, `LIKE '%' || ? || '%'`, nunca tem ESCAPE)."""
        with app.app_context():
            _make_cached_food(search_query="frango grelhado", name="Frango Grelhado")

            _, queries = self._capture_queries(search_foods, "fran")

            assert len(queries) >= 1
            assert "ESCAPE" in queries[0].upper()
            assert "|| '%'" not in queries[0] and '|| ?' not in queries[0]

    def test_prefixo_suficiente_nao_dispara_a_query_de_substring(self, app):
        """Quando o prefixo já preenche o limite pedido, a busca por
        substring (sem índice) nem chega a rodar."""
        with app.app_context():
            for i in range(5):
                _make_cached_food(search_query=f"frango {i}", name=f"Frango {i}")

            _, queries = self._capture_queries(search_foods, "frango", limit=3)

            # Só uma consulta (a de prefixo) deveria ter rodado.
            assert len(queries) == 1
            assert "ESCAPE" in queries[0].upper()

    def test_query_vazia_devolve_lista_vazia(self, app):
        with app.app_context():
            assert search_foods("   ") == []

    def test_resultado_respeita_o_limite_mesmo_combinando_prefixo_e_substring(self, app):
        with app.app_context():
            _make_cached_food(search_query="arroz branco", name="Arroz Branco")
            _make_cached_food(search_query="arroz integral", name="Arroz Integral")
            _make_cached_food(search_query="feijao com arroz", name="Feijão com Arroz")

            results = search_foods("arroz", limit=2)
            assert len(results) == 2


class TestRollbackDaCorridaNaoDescartaTrabalhoNaoRelacionado:
    """Antes, o `except Exception: db.session.rollback()` do insert de um
    alimento novo desfazia a SESSÃO INTEIRA, não só o insert conflitante —
    se qualquer outra coisa estivesse pendente na mesma sessão (ex: outro
    objeto adicionado antes, ainda não commitado), essa outra escrita
    também seria descartada silenciosamente. Agora o insert roda dentro de
    um SAVEPOINT (begin_nested): o rollback desfaz só o que aconteceu
    dentro dele."""

    def test_trabalho_pendente_nao_relacionado_sobrevive_a_uma_corrida(self, app):
        from app.models import User

        with app.app_context():
            # Já existe uma entrada com essa chave — a próxima tentativa de
            # criar a MESMA search_query bate na unique constraint.
            _make_cached_food(search_query="banana", name="Banana")

            # Simula outra escrita pendente na mesma sessão, ainda sem commit,
            # no momento em que a corrida do FoodCache acontece.
            pending_user = User(name="Pendente", email="pendente@example.com")
            pending_user.set_password("SenhaForte1")
            db.session.add(pending_user)

            # Dispara o caminho de "nunca visto antes" pra "banana" de novo —
            # como já existe uma linha com essa chave, o insert bate no
            # unique constraint e cai no except.
            get_cached_or_fetch_macros(
                "banana", {"calories": 90, "protein_g": 1, "carbs_g": 20, "fat_g": 0}
            )

            # O usuário pendente não pode ter sido descartado pelo rollback
            # do FoodCache — ele deveria continuar na sessão, pronto pra ser
            # commitado normalmente.
            db.session.commit()
            assert User.query.filter_by(email="pendente@example.com").first() is not None
