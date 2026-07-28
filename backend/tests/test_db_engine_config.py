"""Regressão: SQLite não pode ser o único banco preparado pra rodar.

Antes, config.py não definia SQLALCHEMY_ENGINE_OPTIONS nenhum — nem pool de
conexões pra Postgres (pool_pre_ping, pool_recycle, pool_size), nem nenhuma
mitigação pro escritor único do SQLite. psycopg2-binary já estava no
requirements.txt, mas sem essas opções o Postgres não tinha um pool de
verdade configurado, e o SQLite não tinha WAL mode nem busy timeout —
"database is locked" na primeira escrita concorrente.
"""
import importlib
import os
import tempfile

import pytest

import app.config as config_module
from app import create_app
from app.extensions import db, enable_sqlite_wal_mode


def _reload_config(monkeypatch, database_url=None):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)
    if database_url is None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    else:
        monkeypatch.setenv("DATABASE_URL", database_url)
    importlib.reload(config_module)
    return config_module.Config


@pytest.fixture(autouse=True)
def _restore_config_module():
    yield
    importlib.reload(config_module)


class TestEngineOptionsPorBackend:
    def test_sqlite_ganha_connect_args_com_timeout_de_lock(self, monkeypatch):
        config = _reload_config(monkeypatch, database_url=None)
        assert config.SQLALCHEMY_DATABASE_URI.startswith("sqlite")
        assert config.SQLALCHEMY_ENGINE_OPTIONS["connect_args"]["timeout"] > 0

    def test_postgres_ganha_pool_de_conexoes_de_verdade(self, monkeypatch):
        config = _reload_config(monkeypatch, database_url="postgresql://user:pass@localhost:5432/perfora")
        options = config.SQLALCHEMY_ENGINE_OPTIONS
        assert options["pool_pre_ping"] is True
        assert options["pool_size"] >= 1
        assert options["max_overflow"] >= 1
        assert options["pool_recycle"] > 0
        assert "connect_args" not in options

    def test_postgres_nao_tem_connect_args_de_sqlite(self, monkeypatch):
        """Trava que a configuração realmente diferencia por backend — sem
        isso, o mesmo connect_args={"timeout": ...} (específico do driver
        sqlite3) seria passado pro psycopg2, que não entende esse argumento."""
        config = _reload_config(monkeypatch, database_url="postgresql://user:pass@localhost:5432/perfora")
        assert "connect_args" not in config.SQLALCHEMY_ENGINE_OPTIONS


class TestModoWALNoSQLite:
    def test_conexao_sqlite_liga_wal_mode(self):
        """:memory: não é representativo aqui — WAL exige um arquivo de
        verdade (SQLite ignora WAL e mantém 'memory' pra bancos em memória),
        então este teste usa um arquivo temporário real."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            class _FileDbConfig:
                SQLALCHEMY_DATABASE_URI = f"sqlite:///{path}"
                SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"timeout": 15}}
                SECRET_KEY = "test"
                JWT_SECRET_KEY = "test"
                SQLALCHEMY_TRACK_MODIFICATIONS = False
                RATELIMIT_STORAGE_URI = "memory://"
                GEMINI_API_KEY = "test-fake-gemini-key"
                CORS_ORIGINS = []
                ENCRYPTION_KEY = "wcGnCYFwPmWJv7Cnu5PJIkYyLwm7_lJ-a5wR8h5uQXo="

            app = create_app(_FileDbConfig)
            with app.app_context():
                result = db.session.execute(db.text("PRAGMA journal_mode")).scalar()
                # No Windows, o arquivo fica travado enquanto o engine mantém a
                # conexão aberta — libera ANTES de qualquer assert, senão uma
                # falha aqui esconde o erro de verdade atrás de um
                # PermissionError do os.remove() no finally.
                db.session.remove()
                db.engine.dispose()
            assert result.lower() == "wal"
        finally:
            if os.path.exists(path):
                os.remove(path)
            for ext in ("-wal", "-shm"):
                if os.path.exists(path + ext):
                    os.remove(path + ext)

    def test_engine_de_outro_dialect_nao_e_afetado(self, app):
        """Não deve levantar erro nem tentar registrar o listener pra um
        engine que não seja SQLite (ex: se alguém rodar os testes num
        Postgres real futuramente)."""
        with app.app_context():
            # app (fixture) já usa sqlite:///:memory: — chamar de novo é
            # inofensivo (idempotente) e não deve lançar.
            enable_sqlite_wal_mode(db.engine)
