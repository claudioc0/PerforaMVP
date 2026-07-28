"""add unique constraints on weight_logs and favorite_meals, rename weight_logs.date

Revision ID: c767fb8713e3
Revises: 148d6f91c829
Create Date: 2026-07-28 12:13:16.370182

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c767fb8713e3'
down_revision = '148d6f91c829'
branch_labels = None
depends_on = None


def upgrade():
    # Favoritos duplicados podem já existir num banco real (nada impedia
    # isso antes) — resolve ANTES da constraint entrar em vigor, senão a
    # própria migration falharia. Mantém o mais recente (maior id) de cada
    # (user_id, description) e descarta os demais.
    op.execute(
        "DELETE FROM favorite_meals WHERE id NOT IN ("
        "SELECT MAX(id) FROM favorite_meals GROUP BY user_id, description"
        ")"
    )
    with op.batch_alter_table('favorite_meals', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_favorite_meals_user_description', ['user_id', 'description'])

    # weight_logs: renomeia "date" para "created_at" (nomenclatura
    # consistente com Meal.created_at/WaterLog.created_at) e adiciona
    # log_date (dia civil, derivado de created_at) para suportar a unique
    # constraint de "um registro de peso por usuário por dia".
    with op.batch_alter_table('weight_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('log_date', sa.Date(), nullable=True))

    op.execute("UPDATE weight_logs SET created_at = date, log_date = date(date)")

    # Registros de peso duplicados no mesmo dia podem já existir (nada
    # impedia isso antes, e o gráfico que agrupa por data mascarava o
    # problema) — mantém o mais recente (maior id) de cada (user_id, log_date).
    op.execute(
        "DELETE FROM weight_logs WHERE id NOT IN ("
        "SELECT MAX(id) FROM weight_logs GROUP BY user_id, log_date"
        ")"
    )

    with op.batch_alter_table('weight_logs', schema=None) as batch_op:
        batch_op.alter_column('created_at', existing_type=sa.DateTime(), nullable=False)
        batch_op.alter_column('log_date', existing_type=sa.Date(), nullable=False)
        batch_op.create_unique_constraint('uq_weight_logs_user_log_date', ['user_id', 'log_date'])
        batch_op.drop_column('date')


def downgrade():
    with op.batch_alter_table('weight_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date', sa.DATETIME(), nullable=True))

    op.execute("UPDATE weight_logs SET date = created_at")

    with op.batch_alter_table('weight_logs', schema=None) as batch_op:
        batch_op.drop_constraint('uq_weight_logs_user_log_date', type_='unique')
        batch_op.drop_column('log_date')
        batch_op.drop_column('created_at')

    with op.batch_alter_table('favorite_meals', schema=None) as batch_op:
        batch_op.drop_constraint('uq_favorite_meals_user_description', type_='unique')
