"""add meetings and meeting_rsvps tables

Revision ID: 0014
Revises: 0013
Create Date: 2026-03-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── CREATE meetings ──────────────────────────────────────────────────────
    op.create_table(
        "meetings",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("round_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("meeting_type", sa.Text(), nullable=False),
        sa.Column("virtual_link", sa.Text(), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "duration_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("60"),
        ),
        sa.Column("created_by", sa.UUID(), nullable=False),
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
        sa.CheckConstraint(
            "meeting_type IN ('in_person','virtual','hybrid')",
            name="ck_meetings_meeting_type",
        ),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_meetings_group_scheduled",
        "meetings",
        ["group_id", sa.text("scheduled_at DESC")],
    )

    # RLS — meetings
    op.execute("ALTER TABLE meetings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE meetings FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY meetings_select ON meetings
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = meetings.group_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY meetings_insert ON meetings
        FOR INSERT
        WITH CHECK (
            created_by = {_UID}
            AND EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = meetings.group_id
                  AND gm.user_id = {_UID}
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY meetings_update ON meetings
        FOR UPDATE
        USING (
            created_by = {_UID}
            OR EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = meetings.group_id
                  AND gm.user_id = {_UID}
                  AND gm.role = 'admin'
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY meetings_delete ON meetings
        FOR DELETE
        USING (
            created_by = {_UID}
            OR EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = meetings.group_id
                  AND gm.user_id = {_UID}
                  AND gm.role = 'admin'
            )
        )
    """)

    # ── CREATE meeting_rsvps ─────────────────────────────────────────────────
    op.create_table(
        "meeting_rsvps",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("meeting_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('going','maybe','not_going','pending')",
            name="ck_meeting_rsvps_status",
        ),
        sa.ForeignKeyConstraint(
            ["meeting_id"], ["meetings.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "meeting_id", "user_id", name="uq_meeting_rsvps_meeting_user"
        ),
    )

    # RLS — meeting_rsvps
    op.execute("ALTER TABLE meeting_rsvps ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE meeting_rsvps FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY meeting_rsvps_select ON meeting_rsvps
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM meetings m
                JOIN group_members gm ON gm.group_id = m.group_id
                JOIN groups g ON g.id = m.group_id
                WHERE m.id = meeting_rsvps.meeting_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY meeting_rsvps_insert ON meeting_rsvps
        FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    op.execute(f"""
        CREATE POLICY meeting_rsvps_update ON meeting_rsvps
        FOR UPDATE
        USING (user_id = {_UID})
    """)

    op.execute("""
        CREATE POLICY meeting_rsvps_delete ON meeting_rsvps
        FOR DELETE
        USING (false)
    """)


def downgrade() -> None:
    # meeting_rsvps first (FK dependency)
    op.execute("DROP POLICY IF EXISTS meeting_rsvps_delete ON meeting_rsvps")
    op.execute("DROP POLICY IF EXISTS meeting_rsvps_update ON meeting_rsvps")
    op.execute("DROP POLICY IF EXISTS meeting_rsvps_insert ON meeting_rsvps")
    op.execute("DROP POLICY IF EXISTS meeting_rsvps_select ON meeting_rsvps")
    op.execute("ALTER TABLE meeting_rsvps DISABLE ROW LEVEL SECURITY")
    op.drop_table("meeting_rsvps")

    op.execute("DROP POLICY IF EXISTS meetings_delete ON meetings")
    op.execute("DROP POLICY IF EXISTS meetings_update ON meetings")
    op.execute("DROP POLICY IF EXISTS meetings_insert ON meetings")
    op.execute("DROP POLICY IF EXISTS meetings_select ON meetings")
    op.execute("ALTER TABLE meetings DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_meetings_group_scheduled", table_name="meetings")
    op.drop_table("meetings")
