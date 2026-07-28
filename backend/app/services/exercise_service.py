import re
from typing import Optional

from app.extensions import db
from app.models import Exercise
from app.utils.pagination import paginate_query

# Mesmo conjunto usado pelo catálogo pré-cadastrado (ver migration
# de34e46399fb) + "outro" como fallback. Qualquer usuário pode criar um
# exercício customizado, mas todos compartilham o mesmo catálogo global — sem
# essa lista, um valor livre digitado por engano ou de má-fé (ex: "PEITO ",
# "pointless spam", um parágrafo inteiro) fica visível pra sempre no picker de
# todo mundo, sem nenhuma forma de filtrar por ele depois.
VALID_MUSCLE_GROUPS = {"peito", "costas", "perna", "ombro", "braço", "core", "outro"}

# Mesmo limite das colunas no banco (ver models/exercise.py) — validar aqui
# devolve um erro 400 com mensagem clara em vez de um 500 de truncamento (ou
# pior, em bancos que truncam silenciosamente, um nome cortado no meio).
MAX_NAME_LENGTH = 120
MAX_EQUIPMENT_LENGTH = 50


class ExerciseService:
    """Camada de serviço para o catálogo global de exercícios.

    Mesma lógica de deduplicação do FoodCache: normaliza o nome antes de
    comparar, pra evitar duplicatas como "Supino Reto" / "supino reto".
    """

    def _normalize(self, text: str) -> str:
        return re.sub(r"\s+", " ", text.strip().lower())

    @staticmethod
    def validate_custom_exercise_data(data: dict) -> list:
        """Valida os dados de um exercício customizado antes de persistir.

        Retorna uma lista de mensagens de erro — vazia se os dados forem
        válidos, seguindo o mesmo padrão de `_validate_password_strength`
        em auth_routes.py.
        """
        errors = []

        name = (data.get("name") or "").strip()
        if not name:
            errors.append("Campo 'name' é obrigatório.")
        elif len(name) > MAX_NAME_LENGTH:
            errors.append(f"'name' deve ter no máximo {MAX_NAME_LENGTH} caracteres.")

        muscle_group = data.get("muscle_group")
        if muscle_group is not None and muscle_group not in VALID_MUSCLE_GROUPS:
            errors.append(
                "'muscle_group' inválido. Valores aceitos: "
                + ", ".join(sorted(VALID_MUSCLE_GROUPS))
            )

        equipment = data.get("equipment")
        if equipment is not None and len(str(equipment)) > MAX_EQUIPMENT_LENGTH:
            errors.append(f"'equipment' deve ter no máximo {MAX_EQUIPMENT_LENGTH} caracteres.")

        return errors

    def search_exercises(
        self,
        page: int,
        per_page: int,
        query: Optional[str] = None,
        muscle_group: Optional[str] = None,
    ) -> tuple:
        """Busca paginada no catálogo, opcionalmente filtrando por texto e/ou
        grupo muscular. Devolve (itens, total) — sem paginação, a lista
        devolvida cresce sem fim conforme o catálogo global acumula entradas.
        """
        q = Exercise.query

        if muscle_group:
            q = q.filter(Exercise.muscle_group == muscle_group)

        if query:
            normalized_query = self._normalize(query)
            q = q.filter(Exercise.normalized_name.contains(normalized_query))

        q = q.order_by(Exercise.name)
        return paginate_query(q, page, per_page)

    def create_custom_exercise(self, data: dict) -> Exercise:
        """Cria um exercício customizado. Se já existir um com o mesmo nome
        normalizado, retorna o existente em vez de duplicar.

        Chame `validate_custom_exercise_data` antes — este método assume que
        os dados já foram validados (não repete a checagem de allowlist).
        """
        name = data.get("name", "").strip()
        normalized_name = self._normalize(name)

        existing = Exercise.query.filter_by(normalized_name=normalized_name).first()
        if existing:
            return existing

        exercise = Exercise(
            name=name,
            normalized_name=normalized_name,
            muscle_group=data.get("muscle_group") or "outro",
            equipment=str(data.get("equipment") or "").strip() or None,
            is_custom=True,
        )
        db.session.add(exercise)
        db.session.commit()
        return exercise
