"""initial

Revision ID: 0001
Revises:
Create Date: 2026-03-04 18:15:45.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_EMAIL_NOTIFICATIONS_SERVER_DEFAULT = (
    '{"meetings": true, "invites": true, "auth": true, '
    '"approaching_end": false, "all_updates": false}'
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("username", sa.Text(), nullable=True),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("status_text", sa.Text(), nullable=True),
        sa.Column("hashed_password", sa.Text(), nullable=True),
        sa.Column(
            "auth_provider",
            sa.String(20),
            nullable=False,
            server_default="local",
        ),
        sa.Column(
            "preferred_genres",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "email_notifications",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text(f"'{_EMAIL_NOTIFICATIONS_SERVER_DEFAULT}'::jsonb"),
        ),
        sa.Column(
            "streak_current",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "streak_longest",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("streak_last_update", sa.Date(), nullable=True),
        sa.Column(
            "total_reading_time_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("hardcover_token_encrypted", sa.Text(), nullable=True),
        sa.Column(
            "timezone",
            sa.String(50),
            nullable=False,
            server_default="America/Sao_Paulo",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "auth_provider IN ('local', 'google', 'magic_link')",
            name="ck_users_auth_provider",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])


def downgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
