"""Regressão pro upgrade Flask-Cors 4.0.1 → 6.0.5.

O motivo do upgrade foram CVEs de matching de origem incorreto (path/regex e
case-sensitivity — PYSEC-2024-71, 2026-1383/1384/1385): a superfície exata que
este teste trava. Não existia nenhum teste que checasse o header
`Access-Control-Allow-Origin` de verdade (só a resolução de `CORS_ORIGINS` a
partir do .env, em `test_config_security.py`) — sem isso, o upgrade podia
mudar silenciosamente o comportamento real de CORS sem nenhum teste acusando.

Usa o mesmo padrão de `resources={r"/api/*": {"origins": ...}}` de
`app/__init__.py`, isolado numa app Flask mínima — o que importa aqui é o
comportamento do Flask-Cors em si, não o resto da stack (JWT/DB/etc.), que já
tem cobertura própria.
"""

from flask import Flask, jsonify
from flask_cors import CORS


def _make_app(origins):
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": origins}})

    @app.route("/api/ping")
    def ping():
        return jsonify({"ok": True})

    @app.route("/outside/ping")
    def outside_ping():
        return jsonify({"ok": True})

    return app.test_client()


class TestOrigemNaAllowlist:
    def test_origem_permitida_recebe_o_header(self):
        client = _make_app(["https://app.perfora.com"])
        response = client.get("/api/ping", headers={"Origin": "https://app.perfora.com"})
        assert response.headers.get("Access-Control-Allow-Origin") == "https://app.perfora.com"

    def test_origem_fora_da_allowlist_nao_recebe_o_header(self):
        client = _make_app(["https://app.perfora.com"])
        response = client.get("/api/ping", headers={"Origin": "https://attacker.example.com"})
        assert response.headers.get("Access-Control-Allow-Origin") is None

    def test_case_do_host_na_origem_e_normalizada_no_matching(self):
        # Hostname é case-insensitive por definição (DNS) — "APP.PERFORA.COM"
        # e "app.perfora.com" são a mesma origem, e o Flask-Cors 6.x trata os
        # dois como iguais (era justamente essa normalização de case que um
        # dos CVEs corrigia: antes o comportamento era inconsistente). Não é
        # meia-doida do jeito que testei antes — é o comportamento correto.
        client = _make_app(["https://app.perfora.com"])
        response = client.get("/api/ping", headers={"Origin": "https://APP.PERFORA.COM"})
        assert response.headers.get("Access-Control-Allow-Origin") == "https://APP.PERFORA.COM"

    def test_prefixo_de_path_nao_vaza_pra_fora_do_padrao_configurado(self):
        # O outro CVE era sobre matching de path incorreto: uma rota fora do
        # padrão configurado (aqui, fora de /api/*) não pode herdar CORS.
        client = _make_app(["https://app.perfora.com"])
        response = client.get("/outside/ping", headers={"Origin": "https://app.perfora.com"})
        assert response.headers.get("Access-Control-Allow-Origin") is None


class TestOrigemCoringa:
    def test_asterisco_libera_qualquer_origem(self):
        # É o comportamento de DEBUG/dev (ver Config.CORS_ORIGINS) — não deve
        # mudar com o upgrade, senão o app quebraria em desenvolvimento local.
        #
        # No Flask-Cors 6.x, "*" não devolve o literal "*" no header — reflete
        # a origem exata da requisição (prática recomendada de CORS quando
        # pode haver credentials envolvido; "*" literal quebra requisição com
        # credentials no navegador). O efeito prático continua o mesmo:
        # qualquer origem passa.
        client = _make_app("*")
        response = client.get("/api/ping", headers={"Origin": "https://qualquer-coisa.com"})
        assert response.headers.get("Access-Control-Allow-Origin") == "https://qualquer-coisa.com"

        other = client.get("/api/ping", headers={"Origin": "https://outra-origem-qualquer.com"})
        assert other.headers.get("Access-Control-Allow-Origin") == "https://outra-origem-qualquer.com"


class TestListaVazia:
    def test_lista_vazia_nao_libera_nenhuma_origem(self):
        # Comportamento de produção sem CORS_ORIGINS configurada (ver
        # test_config_security.py) — nenhuma origem deve passar.
        client = _make_app([])
        response = client.get("/api/ping", headers={"Origin": "https://app.perfora.com"})
        assert response.headers.get("Access-Control-Allow-Origin") is None
