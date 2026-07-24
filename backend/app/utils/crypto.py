"""
Utilitário de criptografia simétrica (Fernet) para dados sensíveis em repouso.

Hoje nenhum campo do banco usa isso ainda — é a base pronta para quando o app
passar a guardar dados de saúde mais sensíveis (ex: condições médicas, notas
do nutricionista, observações clínicas) e precisar cifrá-los antes de gravar
no SQLite/Postgres. Fernet garante confidencialidade E integridade (detecta
adulteração do dado cifrado).

Uso:
    from app.utils.crypto import encrypt_data, decrypt_data

    cifrado = encrypt_data("informação sensível")
    original = decrypt_data(cifrado)
"""
from cryptography.fernet import Fernet, InvalidToken
from flask import current_app

__all__ = ["encrypt_data", "decrypt_data", "InvalidToken", "EncryptionNotConfiguredError"]


class EncryptionNotConfiguredError(RuntimeError):
    """Levantado quando ENCRYPTION_KEY não está definida no ambiente atual."""


def _get_fernet() -> Fernet:
    key = current_app.config.get("ENCRYPTION_KEY")
    if not key:
        raise EncryptionNotConfiguredError(
            "ENCRYPTION_KEY não configurada. Gere uma com: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode("utf-8") if isinstance(key, str) else key)


def encrypt_data(plaintext: str) -> str:
    """Criptografa uma string e retorna o token cifrado (texto, pronto pra salvar num Column)."""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_data(token: str) -> str:
    """Reverte encrypt_data. Levanta InvalidToken se o token foi adulterado ou a chave mudou."""
    return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
