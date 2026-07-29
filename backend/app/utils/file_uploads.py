"""Validação de extensão de arquivo enviado — compartilhada entre
meals_routes.py (fotos de refeição/rótulo) e user_routes.py (fotos de
progresso), pra não duplicar a mesma lista/checagem em dois arquivos de rota.
"""

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def is_allowed_image_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS
