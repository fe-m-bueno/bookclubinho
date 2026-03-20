"""add user_sessions table and auto_sync_hardcover to users

Revision ID: 0019
Revises: 0018
Create Date: 2026-03-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── 1. user_sessions table ─────────────────────────────────────────────────
    op.create_table(
        "user_sessions",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("refresh_token_jti", sa.Text(), nullable=False),
        sa.Column("device_info", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column(
            "last_active_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
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
            name="fk_user_sessions_user_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_sessions"),
        sa.UniqueConstraint("refresh_token_jti", name="uq_user_sessions_jti"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])

    # ── 2. RLS — user_sessions ─────────────────────────────────────────────────
    op.execute("ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY user_sessions_select ON user_sessions FOR SELECT USING ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        f"CREATE POLICY user_sessions_insert ON user_sessions FOR INSERT WITH CHECK ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        f"CREATE POLICY user_sessions_update ON user_sessions FOR UPDATE USING ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        f"CREATE POLICY user_sessions_delete ON user_sessions FOR DELETE USING ("
        f"  user_id = {_UID}"
        f")"
    )

    # ── 3. auto_sync_hardcover column on users ─────────────────────────────────
    op.add_column(
        "users",
        sa.Column(
            "auto_sync_hardcover",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ── 4. Update users_select RLS policy to allow public profile reads ────────
    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute(
        f"CREATE POLICY users_select ON users FOR SELECT USING ("
        f"  id = {_UID} OR "
        f"  (is_active = true AND current_setting('app.current_user_id', true) != '')"
        f")"
    )


def downgrade() -> None:
    # Restore original users_select policy
    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute(
        f"CREATE POLICY users_select ON users FOR SELECT USING ("
        f"  id = {_UID}"
        f")"
    )

    op.drop_column("users", "auto_sync_hardcover")

    op.execute("DROP POLICY IF EXISTS user_sessions_delete ON user_sessions")
    op.execute("DROP POLICY IF EXISTS user_sessions_update ON user_sessions")
    op.execute("DROP POLICY IF EXISTS user_sessions_insert ON user_sessions")
    op.execute("DROP POLICY IF EXISTS user_sessions_select ON user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
