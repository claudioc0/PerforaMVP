"""adiciona is_premium e contador diario de IA em users

Revision ID: 7bfff5a610c3
Revises: 56947b4fde03
Create Date: 2026-07-30 13:03:30.548934

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7bfff5a610c3'
down_revision = '56947b4fde03'
branch_labels = None
depends_on = None


def upgrade():
    # server_default explícito (não só o default= do lado do SQLAlchemy no
    # model) — sem isso, adicionar uma coluna NOT NULL numa tabela com linhas
    # existentes falha no Postgres (produção já tem usuários reais): o
    # default= do model só se aplica a INSERTs feitos pelo ORM, não a linhas
    # já gravadas antes da migration rodar.
    #
    # No SQLite, alterar `users` via batch mode recria a tabela inteira
    # (DROP + CREATE + copia as linhas) — como várias outras tabelas têm FK
    # pra users.id e a engine liga PRAGMA foreign_keys=ON em toda conexão
    # (app/extensions.py), o DROP TABLE users falha com FOREIGN KEY
    # constraint failed no meio da rotina de batch. Desliga a checagem só
    # nesta conexão/transação da migration (ela volta a ligar sozinha na
    # próxima conexão nova, por causa do listener em "connect").
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        conn.execute(sa.text("PRAGMA foreign_keys=OFF"))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_premium', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('daily_ai_calls_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('daily_ai_calls_date', sa.Date(), nullable=True))

    if conn.dialect.name == "sqlite":
        conn.execute(sa.text("PRAGMA foreign_keys=ON"))


def downgrade():
    # Mesmo motivo do upgrade(): batch mode recria a tabela inteira.
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        conn.execute(sa.text("PRAGMA foreign_keys=OFF"))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('daily_ai_calls_date')
        batch_op.drop_column('daily_ai_calls_count')
        batch_op.drop_column('is_premium')

    if conn.dialect.name == "sqlite":
        conn.execute(sa.text("PRAGMA foreign_keys=ON"))
