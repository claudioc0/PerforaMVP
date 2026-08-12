"""Infraestrutura do E2E "de verdade": diferente da suíte em `tests/` (que usa
o Flask test client — chama a view function em processo, sem servidor HTTP
real), aqui sobe o processo real do Flask (`flask run`), aplica as migrations
do zero num SQLite descartável (exercitando o Alembic e o seed de divisões de
treino que a suíte normal nunca toca, porque `tests/conftest.py` usa
`db.create_all()`) e fala com ele por HTTP de verdade via `requests`.

Roda separado da suíte principal (`pytest` sozinho não entra aqui — é preciso
`pytest tests_e2e`) porque é mais lento (sobe processo, aplica migration) e
tem uma finalidade diferente: validar que a aplicação real — WSGI, migrations,
seed de dados, servidor — funciona de ponta a ponta, não a lógica de negócio
isolada (isso já é papel da suíte em `tests/`).
"""

import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

import pytest
import requests

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON_EXE = os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def live_server():
    """Sobe `flask run` real num processo separado, contra um SQLite novo
    (migrado do zero), e devolve a URL base. Derruba tudo no final da sessão."""
    tmp_dir = tempfile.mkdtemp(prefix="perfora_e2e_")
    db_path = os.path.join(tmp_dir, "e2e.db").replace("\\", "/")
    port = _free_port()

    env = os.environ.copy()
    env.update({
        "FLASK_APP": "run.py",
        "FLASK_ENV": "production",
        "SECRET_KEY": "e2e-only-secret-key-never-use-in-production",
        "JWT_SECRET_KEY": "e2e-only-jwt-secret-key-never-use-in-production",
        "DATABASE_URL": f"sqlite:///{db_path}",
        "CORS_ORIGINS": "*",
        "RATELIMIT_STORAGE_URI": "memory://",
        # Placeholder — nenhum teste de jornada chama a IA (isso é papel dos
        # testes de `tests/test_gemini_*`), só precisa passar no "if not
        # api_key" do GeminiService.
        "GEMINI_API_KEY": "e2e-fake-gemini-key",
        "PYTHONIOENCODING": "utf-8",
    })

    migrate = subprocess.run(
        [PYTHON_EXE, "-m", "flask", "db", "upgrade"],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60,
    )
    assert migrate.returncode == 0, (
        f"Falha ao aplicar migrations pro banco do E2E:\n"
        f"stdout: {migrate.stdout}\nstderr: {migrate.stderr}"
    )

    server = subprocess.Popen(
        [PYTHON_EXE, "-m", "flask", "run", "--host", "127.0.0.1", "--port", str(port)],
        cwd=BACKEND_DIR, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )

    base_url = f"http://127.0.0.1:{port}"
    try:
        _wait_until_ready(base_url, server)
        yield base_url
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _wait_until_ready(base_url: str, server: subprocess.Popen, timeout_s: float = 20.0):
    deadline = time.time() + timeout_s
    last_error = None
    while time.time() < deadline:
        if server.poll() is not None:
            output = server.stdout.read() if server.stdout else ""
            raise RuntimeError(f"Servidor do E2E morreu antes de subir:\n{output}")
        try:
            response = requests.get(f"{base_url}/api/meals/health", timeout=1)
            if response.status_code == 200:
                return
        except requests.exceptions.ConnectionError as exc:
            last_error = exc
        time.sleep(0.3)
    raise RuntimeError(f"Servidor do E2E não respondeu em {timeout_s}s (último erro: {last_error})")
