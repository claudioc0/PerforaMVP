"""adiciona expires_at em token_blocklist para permitir limpeza

Revision ID: 7c141a5cfcca
Revises: dc307cefcd46
Create Date: 2026-07-27 19:49:08.058861

"""
from datetime import timedelta

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c141a5cfcca'
down_revision = 'dc307cefcd46'
branch_labels = None
depends_on = None


def upgrade():
    # Adiciona como nullable primeiro para poder popular as linhas já
    # existentes antes de travar a coluna como NOT NULL.
    with op.batch_alter_table('token_blocklist', schema=None) as batch_op:
        batch_op.add_column(sa.Column('expires_at', sa.DateTime(), nullable=True))

    # Backfill: para linhas gravadas antes deste fix, não sabemos o "exp"
    # original do token revogado — só quando ele foi revogado (created_at).
    # Usamos created_at + 7 dias (o maior tempo de vida possível entre os
    # tipos de token, o refresh token) como teto conservador: um token só
    # pode expirar depois de ter sido emitido, e só pode ter sido revogado
    # depois de emitido, então seu "exp" real nunca é maior que
    # created_at + 7 dias. Superestimar aqui é seguro (mantém a linha na
    # blocklist por mais tempo que o necessário); subestimar não seria
    # (apagaria uma revogação que ainda deveria valer).
    conn = op.get_bind()
    token_blocklist = sa.table(
        'token_blocklist',
        sa.column('id', sa.Integer),
        sa.column('created_at', sa.DateTime),
        sa.column('expires_at', sa.DateTime),
    )
    rows = conn.execute(sa.select(token_blocklist.c.id, token_blocklist.c.created_at)).fetchall()
    for row in rows:
        conn.execute(
            token_blocklist.update()
            .where(token_blocklist.c.id == row.id)
            .values(expires_at=row.created_at + timedelta(days=7))
        )

    with op.batch_alter_table('token_blocklist', schema=None) as batch_op:
        batch_op.alter_column('expires_at', existing_type=sa.DateTime(), nullable=False)
        batch_op.create_index(batch_op.f('ix_token_blocklist_expires_at'), ['expires_at'], unique=False)


def downgrade():
    with op.batch_alter_table('token_blocklist', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_token_blocklist_expires_at'))
        batch_op.drop_column('expires_at')
