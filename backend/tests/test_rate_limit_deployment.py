"""Regressão: o rate limiter usa storage em memória (por processo).

Flask-Limiter com RATELIMIT_STORAGE_URI="memory://" guarda os contadores na
memória do processo Python que atende a requisição. Com múltiplos workers
(processos), cada um tem sua própria contagem isolada: "5 por minuto" no
login vira ~5×N por minuto de verdade, sem nenhum aviso, e reseta a cada
worker que sobe. O Procfile é quem garante que isso não aconteça hoje,
fixando um único worker (múltiplas threads são seguras — compartilham a
mesma memória do processo). Se alguém aumentar `--workers` no Procfile sem
também trocar RATELIMIT_STORAGE_URI para um storage compartilhado (ex:
redis://), o rate limit de login/registro volta a ficar furado silenciosamente
— este teste existe pra pegar exatamente essa regressão.
"""

import re
from pathlib import Path

from app.config import Config

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _read_procfile_workers() -> int:
    procfile_path = BACKEND_DIR / "Procfile"
    content = procfile_path.read_text(encoding="utf-8")
    match = re.search(r"--workers\s+(\d+)", content)
    assert match, "Procfile deve definir --workers explicitamente."
    return int(match.group(1))


class TestRateLimiterStorageConsistenteComProcfile:
    def test_procfile_existe_e_define_um_unico_worker(self):
        assert _read_procfile_workers() == 1, (
            "Procfile define mais de 1 worker, mas RATELIMIT_STORAGE_URI "
            "continua no padrão memory:// (por processo) — isso torna os "
            "limites de taxa (ex: 5 por minuto no login) incorretos, já que "
            "cada worker teria sua própria contagem isolada. Se a intenção é "
            "escalar para múltiplos workers, configure RATELIMIT_STORAGE_URI "
            "para um storage compartilhado (ex: redis://) antes de mudar "
            "--workers no Procfile."
        )

    def test_procfile_usa_threads_para_concorrencia_em_vez_de_workers(self):
        """Múltiplas threads no mesmo processo compartilham a mesma memória —
        diferente de múltiplos workers, não fragmentam o contador do limiter."""
        procfile_path = BACKEND_DIR / "Procfile"
        content = procfile_path.read_text(encoding="utf-8")
        assert "--threads" in content, (
            "Procfile deve usar --threads (não --workers) para atender "
            "requisições em paralelo sem fragmentar o storage em memória do "
            "rate limiter."
        )

    def test_storage_padrao_memoria_so_e_correto_com_um_worker(self):
        """Documenta a premissa: o padrão memory:// só é seguro enquanto o
        Procfile garantir um único worker. Se o padrão de storage mudar (ex:
        para redis:// tornar-se o novo padrão), este teste também deve ser
        revisto — ele não deveria mais exigir --workers 1."""
        assert Config.RATELIMIT_STORAGE_URI == "memory://"
        assert _read_procfile_workers() == 1
