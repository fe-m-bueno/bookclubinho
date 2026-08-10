"""add personal_access_tokens table

Revision ID: 0024
Revises: 0023
Create Date: 2026-08-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("prefix", sa.Text(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_personal_access_tokens_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_personal_access_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_personal_access_tokens_token_hash"),
    )
    op.create_index("ix_personal_access_tokens_user_id", "personal_access_tokens", ["user_id"])
    # A resolução do token é um lookup por hash em toda requisição autenticada
    # por Bearer — é o índice mais quente da tabela.
    op.create_index(
        "ix_personal_access_tokens_token_hash",
        "personal_access_tokens",
        ["token_hash"],
    )

    # ── RLS ───────────────────────────────────────────────────────────────────
    #
    # As políticas cobrem o uso normal: cada usuário só enxerga e mexe nos
    # próprios tokens.
    #
    # A resolução do token em si (SELECT por token_hash no início da requisição)
    # roda antes de haver usuário no contexto — é a mesma situação do login, que
    # lê `users` por e-mail sem `app.current_user_id` setado. Nenhuma política
    # pode autorizar esse caso sem liberar a tabela para quem não se autenticou,
    # e liberar seria pior: o que prova a posse do token é conhecer o hash, não
    # ter uma linha de contexto. Fica igual ao login, e o contexto RLS é
    # aplicado logo depois de o token resolver — ver `deps._resolve_bearer_user_id`.
    op.execute("ALTER TABLE personal_access_tokens ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE personal_access_tokens FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY personal_access_tokens_select ON personal_access_tokens FOR SELECT USING ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        f"CREATE POLICY personal_access_tokens_insert ON personal_access_tokens FOR INSERT WITH CHECK ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        f"CREATE POLICY personal_access_tokens_update ON personal_access_tokens FOR UPDATE USING ("
        f"  user_id = {_UID}"
        f")"
    )
    # Sem DELETE: revogação é `revoked_at`, para o token vazado continuar
    # aparecendo no histórico em vez de sumir sem rastro.
    op.execute("CREATE POLICY personal_access_tokens_delete ON personal_access_tokens FOR DELETE USING (false)")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_delete ON personal_access_tokens")
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_update ON personal_access_tokens")
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_insert ON personal_access_tokens")
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_select ON personal_access_tokens")
    op.drop_index("ix_personal_access_tokens_token_hash", table_name="personal_access_tokens")
    op.drop_index("ix_personal_access_tokens_user_id", table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
