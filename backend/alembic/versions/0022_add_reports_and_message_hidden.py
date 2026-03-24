"""add message_reports table and is_hidden to group_messages

Revision ID: 0022
Revises: 0021
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── is_hidden column on group_messages ───────────────────────────────────
    op.add_column(
        "group_messages",
        sa.Column(
            "is_hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ── message_reports table ─────────────────────────────────────────────────
    op.create_table(
        "message_reports",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("group_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reporter_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column(
            "reported_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "reporter_id",
            "message_id",
            name="uq_message_reports_reporter_message",
        ),
    )
    op.create_index("ix_message_reports_message_id", "message_reports", ["message_id"])
    op.create_index("ix_message_reports_group_id", "message_reports", ["group_id"])
    op.create_index("ix_message_reports_reporter_id", "message_reports", ["reporter_id"])

    # ── RLS ───────────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY")

    # Members can insert a report for messages in groups they belong to
    op.execute("""
        CREATE POLICY message_reports_insert ON message_reports
        FOR INSERT
        WITH CHECK (
            reporter_id::text = current_setting('app.current_user_id', true)
            AND EXISTS (
                SELECT 1 FROM group_members
                WHERE group_members.group_id = message_reports.group_id
                  AND group_members.user_id::text = current_setting('app.current_user_id', true)
            )
        )
    """)

    # Members can read their own reports
    op.execute("""
        CREATE POLICY message_reports_select ON message_reports
        FOR SELECT
        USING (reporter_id::text = current_setting('app.current_user_id', true))
    """)

    # Nobody updates/deletes via app — moderation is done by service role
    op.execute("""
        CREATE POLICY message_reports_no_update ON message_reports
        FOR UPDATE
        USING (false)
    """)
    op.execute("""
        CREATE POLICY message_reports_no_delete ON message_reports
        FOR DELETE
        USING (false)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS message_reports_no_delete ON message_reports")
    op.execute("DROP POLICY IF EXISTS message_reports_no_update ON message_reports")
    op.execute("DROP POLICY IF EXISTS message_reports_select ON message_reports")
    op.execute("DROP POLICY IF EXISTS message_reports_insert ON message_reports")
    op.drop_index("ix_message_reports_reporter_id", table_name="message_reports")
    op.drop_index("ix_message_reports_group_id", table_name="message_reports")
    op.drop_index("ix_message_reports_message_id", table_name="message_reports")
    op.drop_table("message_reports")
    op.drop_column("group_messages", "is_hidden")
