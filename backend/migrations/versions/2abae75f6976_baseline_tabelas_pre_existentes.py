"""baseline: tabelas que nunca tinham sido criadas por uma migration

Toda a cadeia de migrations, a partir de ced057c4e347 ("migracao inicial"),
presumia que users, meals, user_goals, water_logs, weight_logs e favorite_meals
já existiam — porque de fato existiam, criadas uma única vez por um
db.create_all() (hoje comentado em app/__init__.py) rodado direto contra o
banco, nunca por uma migration.

Isso funcionava em qualquer ambiente que já tivesse passado por aquele
db.create_all() manual, mas significa que "flask db upgrade" contra um banco
vazio nunca funcionou: a primeira migration real tenta ALTER TABLE numa tabela
"users" que não existe, e falha.

Esta migration entra como a nova raiz da cadeia (Revises: nenhuma) e cria essas
tabelas no estado em que estavam ANTES de ced057c4e347 rodar — incluindo as
quatro colunas de meta nutricional em "users" que a migration seguinte já
remove. O restante do histórico segue seguindo em cima dela sem mudança.

Bancos que já têm essas tabelas (todo ambiente existente) não são afetados:
o alembic_version deles já aponta pra uma revisão mais recente que esta, então
o Alembic nunca tenta reaplicá-la.

Revision ID: 2abae75f6976
Revises:
Create Date: 2026-07-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2abae75f6976'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('password_hash', sa.String(length=256), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        # Removidas pela migration seguinte (ced057c4e347) — as metas passaram
        # a viver em user_goals, mas nesta etapa da história ainda moravam aqui.
        sa.Column('goal_calories', sa.Float(), nullable=True),
        sa.Column('goal_protein_g', sa.Float(), nullable=True),
        sa.Column('goal_carbs_g', sa.Float(), nullable=True),
        sa.Column('goal_fat_g', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    op.create_table(
        'meals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('calories', sa.Float(), nullable=False),
        sa.Column('protein_g', sa.Float(), nullable=False),
        sa.Column('carbs_g', sa.Float(), nullable=False),
        sa.Column('fat_g', sa.Float(), nullable=False),
        # source_type/confidence/user_id: nunca alterados por nenhuma migration
        # posterior, ou seja, já existiam desde este ponto da história.
        sa.Column('source_type', sa.String(length=10), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        # quantity_g e items são adicionados mais adiante na cadeia
        # (87d3c5d1abc4 e c3250b47c449) — de propósito ausentes aqui.
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'user_goals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('goal_calories', sa.Float(), nullable=False),
        sa.Column('goal_protein_g', sa.Float(), nullable=False),
        sa.Column('goal_carbs_g', sa.Float(), nullable=False),
        sa.Column('goal_fat_g', sa.Float(), nullable=False),
        # goal_type só é adicionada mais adiante na cadeia (ccd799a1b509) —
        # de propósito ausente aqui.
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    op.create_table(
        'water_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount_ml', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_water_logs_user_id'), 'water_logs', ['user_id'], unique=False)

    op.create_table(
        'weight_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('weight', sa.Float(), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'favorite_meals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('calories', sa.Float(), nullable=False),
        sa.Column('protein_g', sa.Float(), nullable=False),
        sa.Column('carbs_g', sa.Float(), nullable=False),
        sa.Column('fat_g', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('favorite_meals')
    op.drop_table('weight_logs')
    op.drop_index(op.f('ix_water_logs_user_id'), table_name='water_logs')
    op.drop_table('water_logs')
    op.drop_table('user_goals')
    op.drop_table('meals')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
