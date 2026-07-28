"""Regressão: todo model declarado precisa estar de fato registrado no
SQLAlchemy, e todo arquivo de model precisa estar na lista __all__.

Antes, app/__init__.py importava cada model individualmente numa lista
manual — que já vinha incompleta (UserGoals e WaterLog nunca apareciam
nela) e só funcionava porque importar QUALQUER submódulo de app.models
executa app/models/__init__.py por inteiro como efeito colateral (Python
sempre roda o __init__.py de um pacote antes de resolver um submódulo dele).
Isso significa que a lista era pura decoração — a garantia real de verdade
sempre foi app/models/__init__.py, não o que estava enumerado em
app/__init__.py.
"""
import os

from app.extensions import db
import app.models as models_pkg


class TestTodosOsModelsDeclaradosEstaoRegistrados:
    def test_toda_classe_em_all_tem_tabela_no_metadata_do_sqlalchemy(self, app):
        with app.app_context():
            registered_tablenames = set(db.Model.metadata.tables.keys())

        for name in models_pkg.__all__:
            model_cls = getattr(models_pkg, name)
            assert model_cls.__tablename__ in registered_tablenames, (
                f"{name} está em app.models.__all__ mas não tem tabela "
                "registrada no metadata do SQLAlchemy — db.create_all() e "
                "as migrações vão ignorá-lo silenciosamente."
            )

    def test_todo_arquivo_de_model_esta_em_all(self):
        """Cada .py novo em app/models/ precisa virar uma entrada em __all__
        — senão o model nunca é importado (e portanto nunca registrado) a
        menos que outro módulo o importe transitivamente por acidente, que
        foi exatamente o que aconteceu com UserGoals antes desta correção."""
        models_dir = os.path.dirname(models_pkg.__file__)
        model_files = {
            fname[:-3] for fname in os.listdir(models_dir)
            if fname.endswith(".py") and fname != "__init__.py"
        }

        assert len(model_files) == len(models_pkg.__all__), (
            "O número de arquivos .py em app/models/ não bate com o número "
            "de nomes em app.models.__all__ — algum model novo foi "
            "adicionado sem entrar na lista (ou uma entrada da lista não "
            "corresponde a nenhum arquivo mais)."
        )
