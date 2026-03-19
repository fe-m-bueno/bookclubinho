"""add reading_sessions and progress_type/total_pages/note to reading_progress

Revision ID: 0012
Revises: 0011
Create Date: 2026-03-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── ALTER reading_progress ────────────────────────────────────────────────
    op.add_column(
        "reading_progress",
        sa.Column(
            "progress_type",
            sa.Text(),
            nullable=True,
            server_default="page",
        ),
    )
    op.add_column(
        "reading_progress",
        sa.Column("total_pages", sa.Integer(), nullable=True),
    )
    op.add_column(
        "reading_progress",
        sa.Column("note", sa.Text(), nullable=True),
    )

    op.create_check_constraint(
        "ck_reading_progress_progress_type",
        "reading_progress",
        "progress_type IN ('page', 'chapter', 'percentage', 'finished')",
    )

    # Backfill progress_type based on existing data
    op.execute("""
        UPDATE reading_progress
        SET progress_type = CASE
            WHEN current_page IS NOT NULL THEN 'page'
            ELSE 'percentage'
        END
    """)

    # Now make progress_type NOT NULL
    op.alter_column("reading_progress", "progress_type", nullable=False)

    # ── CREATE reading_sessions ───────────────────────────────────────────────
    op.create_table(
        "reading_sessions",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("round_id", sa.UUID(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # Indexes
    op.create_index(
        "ix_reading_sessions_user_created",
        "reading_sessions",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_reading_sessions_round_user",
        "reading_sessions",
        ["round_id", "user_id"],
    )
    # Partial index for active sessions (ended_at IS NULL)
    op.create_index(
        "ix_reading_sessions_active",
        "reading_sessions",
        ["user_id"],
        postgresql_where=sa.text("ended_at IS NULL"),
    )

    # RLS
    op.execute("ALTER TABLE reading_sessions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE reading_sessions FORCE ROW LEVEL SECURITY")

    # SELECT: any active group member can see sessions for their group's rounds
    op.execute(f"""
        CREATE POLICY reading_sessions_select ON reading_sessions
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

    # INSERT: only the authenticated user can insert their own sessions
    op.execute(f"""
        CREATE POLICY reading_sessions_insert ON reading_sessions
        FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    # UPDATE: only the session owner can update (to stop the session)
    op.execute(f"""
        CREATE POLICY reading_sessions_update ON reading_sessions
        FOR UPDATE
        USING (user_id = {_UID})
    """)

    # DELETE: only the owner may delete their own sessions
    op.execute(f"""
        CREATE POLICY reading_sessions_delete ON reading_sessions
        FOR DELETE
        USING (user_id = {_UID})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS reading_sessions_delete ON reading_sessions")
    op.execute("DROP POLICY IF EXISTS reading_sessions_update ON reading_sessions")
    op.execute("DROP POLICY IF EXISTS reading_sessions_insert ON reading_sessions")
    op.execute("DROP POLICY IF EXISTS reading_sessions_select ON reading_sessions")
    op.drop_index("ix_reading_sessions_active", table_name="reading_sessions")
    op.drop_index("ix_reading_sessions_round_user", table_name="reading_sessions")
    op.drop_index("ix_reading_sessions_user_created", table_name="reading_sessions")
    op.drop_table("reading_sessions")

    op.drop_constraint(
        "ck_reading_progress_progress_type", "reading_progress", type_="check"
    )
    op.drop_column("reading_progress", "note")
    op.drop_column("reading_progress", "total_pages")
    op.drop_column("reading_progress", "progress_type")
