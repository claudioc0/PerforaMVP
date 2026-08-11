"""Regressão/feature: fotos de progresso — upload real (arquivo em disco +
registro no banco), uma por usuário por dia (mesma cadência de WeightLog),
e a rota de servir a imagem nunca devolve a foto de outro usuário.

A pasta de fotos é um diretório REAL em disco (não um banco em memória
isolado por teste) — sem limpar entre testes, arquivos de execuções
diferentes colidem pelo mesmo nome (`{user_id}_{data-de-hoje}.ext`, e
user_id sempre reinicia do 1 em cada teste com banco fresco). O fixture
abaixo isola cada teste nesse diretório físico compartilhado.
"""
import os
from io import BytesIO

import pytest
from PIL import Image

from app.models import ProgressPhoto


def _real_image_bytes(extension: str) -> bytes:
    """Um PNG/JPEG/WEBP mínimo (1x1) de verdade — a rota agora abre o
    upload com Pillow antes de salvar (ver user_routes.py:add_progress_photo),
    então bytes fake não bastam mais pra passar pela validação."""
    pil_format = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}[extension]
    buffer = BytesIO()
    Image.new("RGB", (1, 1), color=(255, 0, 0)).save(buffer, format=pil_format)
    return buffer.getvalue()


@pytest.fixture(autouse=True)
def _isolate_progress_photos_folder(app):
    folder = app.config["PROGRESS_PHOTOS_FOLDER"]

    def _clear():
        if not os.path.isdir(folder):
            return
        for name in os.listdir(folder):
            try:
                os.remove(os.path.join(folder, name))
            except OSError:
                pass  # best-effort — um handle ainda aberto no Windows não deve derrubar o teste

    _clear()
    yield
    _clear()


def _register_and_login(client, email):
    credentials = {"name": "Teste Foto", "email": email, "password": "SenhaForte1"}
    resp = client.post("/api/auth/register", json=credentials)
    assert resp.status_code == 201
    resp = client.post("/api/auth/login", json={"email": email, "password": credentials["password"]})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.get_json()['token']}"}


def _post_photo(client, headers, filename="progresso.jpg"):
    extension = filename.rsplit(".", 1)[-1].lower()
    # Extensão fora da allowlist (ex: "foto.exe") nunca chega na validação
    # de conteúdo — a rota rejeita pelo nome do arquivo antes disso, então
    # bytes fake ainda servem pra esse caso.
    is_image_extension = extension in ("jpg", "jpeg", "png", "webp")
    content = _real_image_bytes(extension) if is_image_extension else b"fake-image-bytes"
    return client.post(
        "/api/user/progress-photos",
        data={"image": (BytesIO(content), filename)},
        content_type="multipart/form-data",
        headers=headers,
    )


class TestUploadDeFotoDeProgresso:
    def test_sem_campo_image_devolve_400(self, client, auth_headers):
        response = client.post("/api/user/progress-photos", json={}, headers=auth_headers)
        assert response.status_code == 400

    def test_extensao_nao_suportada_devolve_400(self, client, auth_headers):
        response = _post_photo(client, auth_headers, filename="foto.exe")
        assert response.status_code == 400

    def test_conteudo_que_nao_e_imagem_devolve_400_mesmo_com_extensao_valida(self, client, auth_headers):
        # Extensão ".png" correta, mas os bytes não são uma imagem de verdade
        # — a extensão sozinha não deve bastar pra passar na validação.
        response = client.post(
            "/api/user/progress-photos",
            data={"image": (BytesIO(b"isto-nao-e-um-png"), "foto.png")},
            content_type="multipart/form-data",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_sucesso_cria_registro_e_arquivo_em_disco(self, client, auth_headers, app):
        response = _post_photo(client, auth_headers)
        assert response.status_code == 201
        body = response.get_json()
        assert "image_url" in body
        assert "taken_at" in body

        with app.app_context():
            photo = ProgressPhoto.query.get(body["id"])
            assert photo is not None
            file_path = os.path.join(app.config["PROGRESS_PHOTOS_FOLDER"], photo.filename)
            assert os.path.exists(file_path)

    def test_segunda_foto_no_mesmo_dia_devolve_409(self, client, auth_headers):
        first = _post_photo(client, auth_headers)
        assert first.status_code == 201

        second = _post_photo(client, auth_headers)
        assert second.status_code == 409


class TestServirImagemRespeitaDono:
    def test_foto_de_outro_usuario_devolve_404(self, client):
        headers_a = _register_and_login(client, "foto-dono-a@example.com")
        headers_b = _register_and_login(client, "foto-dono-b@example.com")

        upload = _post_photo(client, headers_a)
        assert upload.status_code == 201
        photo_id = upload.get_json()["id"]

        # Usuário B tentando acessar a foto de A
        response = client.get(f"/api/user/progress-photos/{photo_id}/image", headers=headers_b)
        assert response.status_code == 404
        response.close()

    def test_foto_inexistente_devolve_404(self, client, auth_headers):
        response = client.get("/api/user/progress-photos/999999/image", headers=auth_headers)
        assert response.status_code == 404
        response.close()

    def test_dono_consegue_acessar_a_propria_foto(self, client, auth_headers):
        upload = _post_photo(client, auth_headers)
        photo_id = upload.get_json()["id"]

        response = client.get(f"/api/user/progress-photos/{photo_id}/image", headers=auth_headers)
        assert response.status_code == 200
        # Libera o handle do arquivo (send_from_directory) antes do fixture
        # de limpeza tentar remover o arquivo em seguida — no Windows, um
        # handle ainda aberto bloqueia o os.remove() com PermissionError.
        response.close()


class TestApagarFotoDeProgresso:
    def test_apaga_registro_e_arquivo(self, client, auth_headers, app):
        upload = _post_photo(client, auth_headers)
        photo_id = upload.get_json()["id"]

        with app.app_context():
            photo = ProgressPhoto.query.get(photo_id)
            file_path = os.path.join(app.config["PROGRESS_PHOTOS_FOLDER"], photo.filename)
            assert os.path.exists(file_path)

        response = client.delete(f"/api/user/progress-photos/{photo_id}", headers=auth_headers)
        assert response.status_code == 200

        with app.app_context():
            assert ProgressPhoto.query.get(photo_id) is None
            assert not os.path.exists(file_path)

    def test_nao_apaga_foto_de_outro_usuario(self, client):
        headers_a = _register_and_login(client, "foto-del-a@example.com")
        headers_b = _register_and_login(client, "foto-del-b@example.com")

        upload = _post_photo(client, headers_a)
        photo_id = upload.get_json()["id"]

        response = client.delete(f"/api/user/progress-photos/{photo_id}", headers=headers_b)
        assert response.status_code == 404

        cleanup = client.delete(f"/api/user/progress-photos/{photo_id}", headers=headers_a)
        assert cleanup.status_code == 200
