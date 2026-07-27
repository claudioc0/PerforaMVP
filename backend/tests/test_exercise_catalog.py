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
    DEFAULT_SEARCH_LIMIT,
    MAX_EQUIPMENT_LENGTH,
    MAX_NAME_LENGTH,
    MAX_SEARCH_LIMIT,
    VALID_MUSCLE_GROUPS,
)


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


class TestTetoDaBuscaDeExercicios:
    def test_busca_sem_filtro_respeita_o_teto_padrao(self, app, client, auth_headers):
        _seed_exercises(app, DEFAULT_SEARCH_LIMIT + 30, "Padrao")

        response = client.get("/api/workouts/exercises", headers=auth_headers)

        assert response.status_code == 200
        assert len(response.get_json()) == DEFAULT_SEARCH_LIMIT

    def test_limit_customizado_e_respeitado(self, app, client, auth_headers):
        _seed_exercises(app, 30, "Custom")

        response = client.get("/api/workouts/exercises?limit=5", headers=auth_headers)

        assert response.status_code == 200
        assert len(response.get_json()) == 5

    def test_limit_acima_do_teto_maximo_e_limitado(self, app, client, auth_headers):
        _seed_exercises(app, MAX_SEARCH_LIMIT + 30, "Teto")

        response = client.get("/api/workouts/exercises?limit=99999", headers=auth_headers)

        assert response.status_code == 200
        assert len(response.get_json()) == MAX_SEARCH_LIMIT


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
