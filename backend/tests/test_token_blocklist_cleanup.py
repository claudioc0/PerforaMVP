"""Regressão: a blocklist de tokens (logout) não pode crescer pra sempre.

Antes, cada revogação (logout) ficava na tabela `token_blocklist`
indefinidamente — sem nenhuma limpeza, sem job de expiração — mesmo depois
que o token revogado já teria expirado naturalmente por conta própria. Como
`check_if_token_revoked` (app/__init__.py) consulta essa tabela em TODA
requisição autenticada, ela só crescia.

A correção: cada linha grava o "exp" real do token que revogou
(`expires_at`), e o próprio logout aproveita seu commit para apagar linhas
já expiradas. Isso é sempre seguro porque o Flask-JWT-Extended já rejeita um
token expirado pela própria assinatura, com ou sem essa linha na blocklist —
apagar uma linha expirada nunca reabre uma sessão que deveria continuar
revogada.
"""
from datetime import timedelta

from app.extensions import db
from app.models import TokenBlocklist, User


def _login(client, credentials):
    return client.post(
        "/api/auth/login",
        json={"email": credentials["email"], "password": credentials["password"]},
    )


class TestTokenBlocklistExpiresAt:
    def test_logout_grava_expires_at_igual_ao_exp_do_token(self, app, client, registered_user):
        login_response = _login(client, registered_user)
        access_token = login_response.get_json()["token"]

        with app.app_context():
            from flask_jwt_extended import decode_token

            claims = decode_token(access_token)

        logout_response = client.post(
            "/api/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert logout_response.status_code == 200

        with app.app_context():
            from datetime import datetime

            row = TokenBlocklist.query.filter_by(jti=claims["jti"]).first()
            assert row is not None
            assert row.expires_at is not None
            # Ambos naive em UTC (mesma convenção do resto do código, ver
            # datetime.utcnow() em created_at) — datetime.timestamp() não
            # serve aqui porque ele assume horário LOCAL para datetimes
            # naive, o que quebraria a comparação em qualquer fuso != UTC.
            assert row.expires_at == datetime.utcfromtimestamp(claims["exp"])


class TestTokenBlocklistCleanupNoLogout:
    """Cada logout aproveita seu próprio commit pra apagar linhas já
    expiradas — sem precisar de cron/job separado no caminho comum."""

    def test_logout_remove_linhas_ja_expiradas_da_blocklist(self, app, client, registered_user):
        # Simula uma revogação antiga cujo token já expirou há muito tempo
        # (ex: um logout de dias atrás que nunca foi limpo) — construída
        # direto no banco, como uma revogação legítima feita antes desta
        # correção existir (quando expires_at ainda não era gravado).
        with app.app_context():
            from datetime import datetime

            stale_jti = "stale-jti-simulada-1234"
            stale_exp = datetime.utcnow() - timedelta(days=2)
            db.session.add(TokenBlocklist(jti=stale_jti, expires_at=stale_exp))
            db.session.commit()

            assert TokenBlocklist.query.filter_by(jti=stale_jti).first() is not None

        login_response = _login(client, registered_user)
        access_token = login_response.get_json()["token"]

        logout_response = client.post(
            "/api/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert logout_response.status_code == 200

        with app.app_context():
            # A linha antiga (já expirada) some — o commit do logout limpou.
            assert TokenBlocklist.query.filter_by(jti=stale_jti).first() is None

    def test_logout_nao_remove_revogacao_ainda_valida(self, app, client, registered_user):
        """Uma revogação cujo token ainda não expirou tem que sobreviver ao
        commit de limpeza de OUTRO logout — senão reabriríamos uma sessão que
        deveria continuar bloqueada."""
        with app.app_context():
            from datetime import datetime

            still_valid_jti = "ainda-valido-jti-5678"
            still_valid_exp = datetime.utcnow() + timedelta(hours=1)
            db.session.add(TokenBlocklist(jti=still_valid_jti, expires_at=still_valid_exp))
            db.session.commit()

        login_response = _login(client, registered_user)
        access_token = login_response.get_json()["token"]

        logout_response = client.post(
            "/api/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert logout_response.status_code == 200

        with app.app_context():
            assert TokenBlocklist.query.filter_by(jti=still_valid_jti).first() is not None


class TestCleanupExpiredTokensCliCommand:
    """Rede de segurança pra apps com pouco tráfego de logout: um comando
    manual/cron que faz a mesma limpeza, sem depender de um logout acontecer."""

    def test_comando_remove_apenas_tokens_expirados(self, app):
        from datetime import datetime

        with app.app_context():
            expired_jti = "expired-jti-cli-1"
            valid_jti = "valid-jti-cli-2"
            db.session.add(TokenBlocklist(jti=expired_jti, expires_at=datetime.utcnow() - timedelta(days=1)))
            db.session.add(TokenBlocklist(jti=valid_jti, expires_at=datetime.utcnow() + timedelta(days=1)))
            db.session.commit()

            runner = app.test_cli_runner()
            result = runner.invoke(args=["cleanup-expired-tokens"])

            assert result.exit_code == 0
            assert TokenBlocklist.query.filter_by(jti=expired_jti).first() is None
            assert TokenBlocklist.query.filter_by(jti=valid_jti).first() is not None
