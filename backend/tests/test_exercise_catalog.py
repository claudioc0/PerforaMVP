"""Validação e teto no catálogo global de exercícios.

A tabela `exercises` é compartilhada por todos os usuários — antes desta
mudança, qualquer conta podia gravar um `muscle_group` qualquer (texto livre,
sem allowlist) ou um nome/equipamento enorme, poluindo o picker de todo mundo
pra sempre (o catálogo nunca é limpo). A busca também não tinha teto de
resultados: sem filtro nenhum (o caso usado pra simplesmente abrir o picker),
a lista devolvida crescia pra sempre conforme o catálogo acumulava entradas.
"""

import pytest

from app.extensions import db
from app.models import Exercise
from app.services.exercise_service import (
    MAX_EQUIPMENT_LENGTH,
    MAX_NAME_LENGTH,
    VALID_MUSCLE_GROUPS,
)
from app.utils.pagination import DEFAULT_PER_PAGE, MAX_PER_PAGE


def _seed_exercises(app, count, prefix):
    with app.app_context():
        for i in range(count):
            db.session.add(
                Exercise(
                    name=f"{prefix} {i}",
                    normalized_name=f"{prefix.lower()} {i}",
                    muscle_group="outro",
                    is_custom=True,
                )
            )
        db.session.commit()


class TestValidacaoDeExercicioCustomizado:
    def test_rejeita_muscle_group_fora_da_allowlist(self, client, auth_headers):
        response = client.post(
            "/api/workouts/exercises",
            json={"name": "Exercicio Teste", "muscle_group": "gluteo_texto_livre"},
            headers=auth_headers,
        )
        assert response.status_code == 400
        assert "muscle_group" in response.get_json()["details"][0]

    @pytest.mark.parametrize("muscle_group", sorted(VALID_MUSCLE_GROUPS))
    def test_aceita_qualquer_valor_da_allowlist(self, client, auth_headers, muscle_group):
        response = client.post(
            "/api/workouts/exercises",
            json={"name": f"Exercicio {muscle_group}", "muscle_group": muscle_group},
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.get_json()["muscle_group"] == muscle_group

    def test_sem_muscle_group_cai_no_padrao_outro(self, client, auth_headers):
        response = client.post(
            "/api/workouts/exercises", json={"name": "Exercicio Sem Grupo"}, headers=auth_headers
        )
        assert response.status_code == 201
        assert response.get_json()["muscle_group"] == "outro"

    def test_rejeita_nome_maior_que_o_limite(self, client, auth_headers):
        response = client.post(
            "/api/workouts/exercises",
            json={"name": "A" * (MAX_NAME_LENGTH + 1)},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_aceita_nome_exatamente_no_limite(self, client, auth_headers):
        response = client.post(
            "/api/workouts/exercises",
            json={"name": "A" * MAX_NAME_LENGTH},
            headers=auth_headers,
        )
        assert response.status_code == 201

    def test_rejeita_equipment_maior_que_o_limite(self, client, auth_headers):
        response = client.post(
            "/api/workouts/exercises",
            json={"name": "Exercicio Teste", "equipment": "A" * (MAX_EQUIPMENT_LENGTH + 1)},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_rejeita_nome_vazio_ou_so_espacos(self, client, auth_headers):
        response = client.post("/api/workouts/exercises", json={"name": "   "}, headers=auth_headers)
        assert response.status_code == 400

    def test_erro_de_validacao_nao_grava_nada_no_catalogo(self, app, client, auth_headers):
        client.post(
            "/api/workouts/exercises",
            json={"name": "Nunca Deveria Existir", "muscle_group": "grupo_invalido"},
            headers=auth_headers,
        )
        with app.app_context():
            assert Exercise.query.filter_by(normalized_name="nunca deveria existir").first() is None


class TestPaginacaoDaBuscaDeExercicios:
    def test_busca_sem_parametros_respeita_o_per_page_padrao(self, app, client, auth_headers):
        _seed_exercises(app, DEFAULT_PER_PAGE + 30, "Padrao")

        response = client.get("/api/workouts/exercises", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == DEFAULT_PER_PAGE
        assert body["page"] == 1
        assert body["per_page"] == DEFAULT_PER_PAGE
        assert body["total"] == DEFAULT_PER_PAGE + 30
        assert body["has_more"] is True

    def test_per_page_customizado_e_respeitado(self, app, client, auth_headers):
        _seed_exercises(app, 30, "Custom")

        response = client.get("/api/workouts/exercises?per_page=5", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == 5
        assert body["has_more"] is True

    def test_per_page_acima_do_teto_maximo_e_limitado(self, app, client, auth_headers):
        _seed_exercises(app, MAX_PER_PAGE + 30, "Teto")

        response = client.get("/api/workouts/exercises?per_page=99999", headers=auth_headers)

        assert response.status_code == 200
        body = response.get_json()
        assert len(body["items"]) == MAX_PER_PAGE
        assert body["per_page"] == MAX_PER_PAGE

    def test_segunda_pagina_devolve_itens_diferentes_da_primeira(self, app, client, auth_headers):
        _seed_exercises(app, 30, "Pagina")

        page1 = client.get("/api/workouts/exercises?per_page=10&page=1", headers=auth_headers).get_json()
        page2 = client.get("/api/workouts/exercises?per_page=10&page=2", headers=auth_headers).get_json()

        ids_page1 = {e["id"] for e in page1["items"]}
        ids_page2 = {e["id"] for e in page2["items"]}
        assert len(page1["items"]) == 10
        assert len(page2["items"]) == 10
        assert ids_page1.isdisjoint(ids_page2)
        assert page1["total"] == 30
        assert page2["has_more"] is True

    def test_ultima_pagina_indica_has_more_falso(self, app, client, auth_headers):
        _seed_exercises(app, 15, "Final")

        response = client.get("/api/workouts/exercises?per_page=10&page=2", headers=auth_headers)

        body = response.get_json()
        assert len(body["items"]) == 5
        assert body["has_more"] is False


class TestRateLimitNoCadastroDeExercicio:
    def test_bloqueia_apos_o_limite_por_hora(self, client, auth_headers):
        statuses = [
            client.post(
                "/api/workouts/exercises", json={"name": f"Exercicio Loop {i}"}, headers=auth_headers
            ).status_code
            for i in range(21)
        ]

        assert 429 not in statuses[:20]
        assert statuses[20] == 429
