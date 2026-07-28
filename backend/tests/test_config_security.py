"""Regressão: .env.example não pode ligar debug mode se copiado sem edição.

FLASK_ENV=development habilita o console interativo do Werkzeug em qualquer
erro não tratado — se exposto num servidor real, é execução remota de código.
config.py já assume produção com segurança quando a variável está AUSENTE
(`os.getenv("FLASK_ENV", "production")`), mas .env.example existe justamente
pra ser copiado — se ele viesse com "development" explícito, copiar sem editar
essa única linha bastava pra ligar o debug em produção.
"""

import importlib
import re
from pathlib import Path

import pytest

import app.config as config_module


def _read_flask_env_from_dotenv(path: Path) -> str:
    content = path.read_text(encoding="utf-8")
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("FLASK_ENV="):
            return stripped.split("=", 1)[1].strip()
    pytest.fail(f"FLASK_ENV não encontrado em {path}")


def _reload_config(monkeypatch, flask_env_value=None, cors_origins_value="__unset__"):
    """Recarrega app.config com FLASK_ENV/CORS_ORIGINS nos valores dados.

    Recarrega o módulo de verdade (em vez de reimplementar a conta ao lado)
    pra travar o comportamento real de config.py, não uma cópia dele que
    poderia divergir sem que o teste percebesse.

    Neutraliza load_dotenv() antes de recarregar: sem isso, o .env real deste
    projeto (que tem FLASK_ENV=development, correto pra rodar localmente)
    repopularia as variáveis a cada reload, mascarando o caso de "ausente" —
    que é justamente o cenário de um servidor de verdade sem nenhum .env.
    """
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)

    if flask_env_value is None:
        monkeypatch.delenv("FLASK_ENV", raising=False)
    else:
        monkeypatch.setenv("FLASK_ENV", flask_env_value)

    if cors_origins_value == "__unset__":
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
    elif cors_origins_value is None:
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
    else:
        monkeypatch.setenv("CORS_ORIGINS", cors_origins_value)

    importlib.reload(config_module)
    return config_module.Config


def _reload_debug_flag(monkeypatch, flask_env_value):
    return _reload_config(monkeypatch, flask_env_value=flask_env_value).DEBUG


@pytest.fixture(autouse=True)
def _restore_config_module():
    """Deixa app.config recarregado com o FLASK_ENV real do processo ao final
    de cada teste, pra não vazar estado pros outros arquivos de teste."""
    yield
    importlib.reload(config_module)


class TestEnvExampleSeguro:
    def test_env_example_nao_vem_com_development(self):
        env_example_path = Path(__file__).resolve().parent.parent / ".env.example"
        value = _read_flask_env_from_dotenv(env_example_path)

        assert value != "development", (
            ".env.example não pode vir com FLASK_ENV=development — copiar este "
            "arquivo pra um servidor real sem editar essa linha ligaria o "
            "console de debug do Werkzeug (execução remota de código)."
        )


class TestConfigDebugFailSafe:
    """Trava o comportamento que .env.example depende: sem FLASK_ENV=development
    explícito, o Flask nunca roda em modo debug — ausência ou qualquer outro
    valor sempre assume produção.
    """

    def test_ausencia_da_variavel_assume_producao(self, monkeypatch):
        assert _reload_debug_flag(monkeypatch, None) is False

    @pytest.mark.parametrize("value", ["production", "prod", "", "Development", "DEVELOPMENT"])
    def test_qualquer_valor_diferente_de_development_exato_assume_producao(self, monkeypatch, value):
        assert _reload_debug_flag(monkeypatch, value) is False

    def test_development_exato_e_o_unico_valor_que_liga_debug(self, monkeypatch):
        assert _reload_debug_flag(monkeypatch, "development") is True


class TestEnvExampleNaoAbreCorsPorEsquecimento:
    def test_env_example_nao_tem_cors_origins_ativo_como_asterisco(self):
        """CORS_ORIGINS=* pode aparecer comentado (documentação), mas não como
        linha ativa — copiar o arquivo sem editar não pode abrir CORS geral."""
        env_example_path = Path(__file__).resolve().parent.parent / ".env.example"
        content = env_example_path.read_text(encoding="utf-8")

        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if stripped.startswith("CORS_ORIGINS="):
                value = stripped.split("=", 1)[1].strip()
                assert value != "*", (
                    ".env.example não pode ter CORS_ORIGINS=* como linha ativa — "
                    "copiar isso pra produção sem editar abriria a API pra "
                    "qualquer origem por padrão."
                )


class TestCorsOriginsFailSafe:
    """Sem CORS_ORIGINS explícita, o padrão dependia só de DEBUG e sempre virava
    "*" — ou seja, faltar essa variável num deploy de produção liberava CORS
    pra qualquer site, silenciosamente. Agora o padrão sem a variável segue
    DEBUG: "*" em desenvolvimento, fechado (lista vazia) em produção.
    """

    def test_ausente_em_desenvolvimento_libera_qualquer_origem(self, monkeypatch):
        config = _reload_config(monkeypatch, flask_env_value="development", cors_origins_value=None)
        assert config.CORS_ORIGINS == "*"

    def test_ausente_em_producao_nao_libera_nenhuma_origem(self, monkeypatch):
        config = _reload_config(monkeypatch, flask_env_value="production", cors_origins_value=None)
        assert config.CORS_ORIGINS == []

    def test_ausente_sem_flask_env_nenhum_tambem_fecha_por_seguranca(self, monkeypatch):
        config = _reload_config(monkeypatch, flask_env_value=None, cors_origins_value=None)
        assert config.CORS_ORIGINS == []

    def test_asterisco_explicito_e_respeitado_mesmo_em_producao(self, monkeypatch):
        """Definir "*" é uma escolha consciente de quem configura o deploy —
        continua funcionando, só não é mais o padrão silencioso."""
        config = _reload_config(monkeypatch, flask_env_value="production", cors_origins_value="*")
        assert config.CORS_ORIGINS == "*"

    def test_lista_explicita_e_parseada_independente_do_ambiente(self, monkeypatch):
        config = _reload_config(
            monkeypatch,
            flask_env_value="production",
            cors_origins_value="https://meuapp.com, https://admin.meuapp.com",
        )
        assert config.CORS_ORIGINS == ["https://meuapp.com", "https://admin.meuapp.com"]


class TestGeminiModelNameFallbackNuncaEhInvalido:
    """Um typo existiu aqui antes ("gemini-1.5-flash-lastest") — como
    GEMINI_MODEL_NAME sempre tem valor em config.py, esse fallback é sempre
    o que chega em GeminiService (o "or os.getenv(...)" dentro do próprio
    GeminiService.__init__ nunca é alcançado na prática). Se
    GEMINI_MODEL_NAME sumir do ambiente e o fallback for um nome de modelo
    inexistente, toda chamada de IA passa a dar 404 justamente no cenário em
    que o app deveria continuar funcionando com um padrão razoável.
    """

    def test_ausencia_da_variavel_nao_usa_um_nome_com_typo(self, monkeypatch):
        monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)
        monkeypatch.delenv("GEMINI_MODEL_NAME", raising=False)
        importlib.reload(config_module)

        assert "lastest" not in config_module.Config.GEMINI_MODEL_NAME

    def test_fallback_de_config_concorda_com_o_fallback_do_gemini_service(self, monkeypatch):
        """Os dois fallbacks (config.py e gemini_service.py) precisam apontar
        pro mesmo modelo — senão o de config.py sempre "vence" (é sempre
        passado explicitamente pro GeminiService) e o de gemini_service.py
        nunca é alcançado de verdade."""
        monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)
        monkeypatch.delenv("GEMINI_MODEL_NAME", raising=False)
        importlib.reload(config_module)

        import app.services.gemini_service as gemini_service_module
        import inspect
        source = inspect.getsource(gemini_service_module.GeminiService.__init__)
        match = re.search(r'os\.getenv\("GEMINI_MODEL_NAME",\s*"([^"]+)"\)', source)
        assert match, "não encontrou o fallback de GEMINI_MODEL_NAME em GeminiService.__init__"
        assert config_module.Config.GEMINI_MODEL_NAME == match.group(1)
