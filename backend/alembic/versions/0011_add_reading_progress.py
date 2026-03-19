"""add reading_progress table

Revision ID: 0011
Revises: 0010
Create Date: 2026-03-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── reading_progress ──────────────────────────────────────────────────────
    op.create_table(
        "reading_progress",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("round_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("current_page", sa.Integer(), nullable=True),
        sa.Column(
            "percentage",
            sa.Float(),
            server_default=sa.text("0.0"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "current_page >= 0",
            name="ck_reading_progress_page_non_negative",
        ),
        sa.CheckConstraint(
            "percentage >= 0 AND percentage <= 100",
            name="ck_reading_progress_percentage_range",
        ),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_reading_progress_round_id", "reading_progress", ["round_id"])
    op.create_index("ix_reading_progress_user_id", "reading_progress", ["user_id"])
    op.create_index(
        "ix_reading_progress_round_user_created",
        "reading_progress",
        ["round_id", "user_id", sa.text("created_at DESC")],
    )

    # RLS
    op.execute("ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE reading_progress FORCE ROW LEVEL SECURITY")

    # SELECT: any active group member can see progress for their group's rounds
    op.execute(f"""
        CREATE POLICY reading_progress_select ON reading_progress
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM rounds r
                JOIN group_members gm ON gm.group_id = r.group_id
                JOIN groups g ON g.id = gm.group_id
                WHERE r.id = round_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)

    # INSERT: only the authenticated user can insert their own progress
    op.execute(f"""
        CREATE POLICY reading_progress_insert ON reading_progress
        FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    # UPDATE: deny all — rows are immutable snapshots
    op.execute("""
        CREATE POLICY reading_progress_update ON reading_progress
        FOR UPDATE
        USING (false)
    """)

    # DELETE: only the owner may delete their own rows
    op.execute(f"""
        CREATE POLICY reading_progress_delete ON reading_progress
        FOR DELETE
        USING (user_id = {_UID})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS reading_progress_delete ON reading_progress")
    op.execute("DROP POLICY IF EXISTS reading_progress_update ON reading_progress")
    op.execute("DROP POLICY IF EXISTS reading_progress_insert ON reading_progress")
    op.execute("DROP POLICY IF EXISTS reading_progress_select ON reading_progress")
    op.drop_index("ix_reading_progress_round_user_created", table_name="reading_progress")
    op.drop_index("ix_reading_progress_user_id", table_name="reading_progress")
    op.drop_index("ix_reading_progress_round_id", table_name="reading_progress")
    op.drop_table("reading_progress")
