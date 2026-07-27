"""Regressão: .env.example não pode ligar debug mode se copiado sem edição.

FLASK_ENV=development habilita o console interativo do Werkzeug em qualquer
erro não tratado — se exposto num servidor real, é execução remota de código.
config.py já assume produção com segurança quando a variável está AUSENTE
(`os.getenv("FLASK_ENV", "production")`), mas .env.example existe justamente
pra ser copiado — se ele viesse com "development" explícito, copiar sem editar
essa única linha bastava pra ligar o debug em produção.
"""

import importlib
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


def _reload_debug_flag(monkeypatch, flask_env_value):
    """Recarrega app.config com FLASK_ENV no valor dado e devolve Config.DEBUG.

    Recarrega o módulo de verdade (em vez de reimplementar a conta ao lado)
    pra travar o comportamento real de config.py, não uma cópia dele que
    poderia divergir sem que o teste percebesse.

    Neutraliza load_dotenv() antes de recarregar: sem isso, o .env real deste
    projeto (que tem FLASK_ENV=development, correto pra rodar localmente)
    repopularia a variável a cada reload, mascarando o caso de "ausente" — que
    é justamente o cenário de um servidor de verdade sem nenhum .env.
    """
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)
    if flask_env_value is None:
        monkeypatch.delenv("FLASK_ENV", raising=False)
    else:
        monkeypatch.setenv("FLASK_ENV", flask_env_value)
    importlib.reload(config_module)
    return config_module.Config.DEBUG


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
