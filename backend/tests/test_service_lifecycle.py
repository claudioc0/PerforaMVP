"""Regressão: o ciclo de vida diferente entre services (singleton por módulo
vs. fábrica por request) segue um critério real, não é arbitrário.

user_routes.py/workouts_routes.py instanciam seus services uma única vez no
import do módulo (singleton por processo) porque nenhum deles guarda estado
próprio nem depende de app.config no __init__. meals_routes.py usa uma
fábrica (`_get_meal_service()`, chamada de novo em toda request) porque
MealService precisa construir um GeminiService cuja fábrica lê app.config —
algo que só existe dentro de um contexto de app/request, não no import do
módulo.
"""
from app.routes import meals_routes, user_routes, workouts_routes


class TestServicosSemEstadoSaoSingletonPorModulo:
    def test_user_service_e_a_mesma_instancia_em_todo_o_processo(self):
        from app.routes.user_routes import user_service as first_import

        assert user_routes.user_service is first_import

    def test_workouts_routes_expoe_singletons_para_todos_os_seus_services(self):
        assert workouts_routes.workout_service is not None
        assert workouts_routes.exercise_service is not None
        assert workouts_routes.split_service is not None
        assert workouts_routes.weekly_plan_service is not None

        # As rotas de workouts_routes.py precisam usar ESSES singletons de
        # módulo, não reconstruir um novo a cada chamada de rota (o padrão
        # que meals_routes.py usa, e só ele, por um motivo específico).
        import inspect
        source = inspect.getsource(workouts_routes)
        assert "def _get_workout_service" not in source
        assert "def _get_exercise_service" not in source


class TestMealServiceUsaFabricaPorRequestPorDependerDeAppConfig:
    def test_get_meal_service_devolve_uma_instancia_nova_a_cada_chamada(self, app):
        """Diferente dos singletons acima: cada chamada a _get_meal_service()
        precisa devolver uma instância NOVA, porque a fábrica de
        GeminiService dentro dela captura app.config no momento da chamada —
        virar um singleton de módulo quebraria isso (não existe app.config
        acessível na hora do import do módulo)."""
        with app.test_request_context():
            first = meals_routes._get_meal_service()
            second = meals_routes._get_meal_service()

        assert first is not second
