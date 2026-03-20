"""add wrapped_reports table

Revision ID: 0018
Revises: 0017
Create Date: 2026-03-20
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── 1. wrapped_reports ─────────────────────────────────────────────────────
    op.create_table(
        "wrapped_reports",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("data", JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated_by", sa.UUID(), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            name="fk_wrapped_reports_group_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["generated_by"],
            ["users.id"],
            name="fk_wrapped_reports_generated_by",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wrapped_reports"),
        sa.UniqueConstraint("group_id", "year", name="uq_wrapped_reports_group_year"),
    )
    op.create_index("ix_wrapped_reports_group_id", "wrapped_reports", ["group_id"])

    # ── 2. RLS — wrapped_reports ───────────────────────────────────────────────
    op.execute("ALTER TABLE wrapped_reports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE wrapped_reports FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY wrapped_reports_select ON wrapped_reports FOR SELECT USING ("
        f"  EXISTS ("
        f"    SELECT 1 FROM group_members gm "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE gm.group_id = wrapped_reports.group_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        f"CREATE POLICY wrapped_reports_insert ON wrapped_reports FOR INSERT WITH CHECK ("
        f"  generated_by = {_UID} AND EXISTS ("
        f"    SELECT 1 FROM group_members gm "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE gm.group_id = wrapped_reports.group_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        f"CREATE POLICY wrapped_reports_update ON wrapped_reports FOR UPDATE USING ("
        f"  EXISTS ("
        f"    SELECT 1 FROM group_members gm "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE gm.group_id = wrapped_reports.group_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        "CREATE POLICY wrapped_reports_delete ON wrapped_reports FOR DELETE USING (false)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS wrapped_reports_delete ON wrapped_reports")
    op.execute("DROP POLICY IF EXISTS wrapped_reports_update ON wrapped_reports")
    op.execute("DROP POLICY IF EXISTS wrapped_reports_insert ON wrapped_reports")
    op.execute("DROP POLICY IF EXISTS wrapped_reports_select ON wrapped_reports")
    op.drop_index("ix_wrapped_reports_group_id", table_name="wrapped_reports")
    op.drop_table("wrapped_reports")
