"""backfill founder badges for existing group creators

Revision ID: 0020
Revises: 0019
Create Date: 2026-03-23

Contexto: a badge "founder" nunca era concedida automaticamente porque o
BackgroundTask do badge checker rodava antes do commit da sessão principal,
causando uma race condition. Esta migration concede a badge retroativamente
a todos os usuários que criaram pelo menos 1 grupo ativo e ainda não a têm.
"""

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Para cada usuário que criou um grupo ativo e não tem a badge "founder",
    # insere um registro em user_badges usando o grupo mais antigo como contexto.
    # ON CONFLICT DO NOTHING garante idempotência.
    op.execute(
        """
        INSERT INTO user_badges (user_id, badge_id, group_id, earned_at)
        SELECT DISTINCT ON (g.created_by)
            g.created_by,
            b.id,
            g.id,
            g.created_at
        FROM groups g
        JOIN badges b ON b.slug = 'founder'
        WHERE g.is_active = true
          AND g.created_by IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM user_badges ub
              WHERE ub.user_id = g.created_by
                AND ub.badge_id = b.id
          )
        ORDER BY g.created_by, g.created_at ASC
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove badges de founder que foram criadas por esta migration (earned_at
    # corresponde ao created_at do grupo — distinção razoável para rollback).
    # Não é possível distinguir perfeitamente, então o downgrade é no-op seguro.
    pass
