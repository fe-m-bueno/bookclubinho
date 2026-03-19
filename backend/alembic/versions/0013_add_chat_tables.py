"""add group_messages and message_reactions tables

Revision ID: 0013
Revises: 0012
Create Date: 2026-03-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── CREATE group_messages ─────────────────────────────────────────────────
    op.create_table(
        "group_messages",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("round_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("content_rich_json", postgresql.JSONB(), nullable=True),
        sa.Column("media_url", sa.Text(), nullable=True),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("reference_type", sa.Text(), nullable=True),
        sa.Column("reference_value", sa.Text(), nullable=True),
        sa.Column(
            "is_spoiler",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("spoiler_chapter", sa.Integer(), nullable=True),
        sa.Column("parent_message_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.CheckConstraint(
            "content_type IN ('text','image','gif','video_link','quote','chapter_marker','page_marker','system')",
            name="ck_group_messages_content_type",
        ),
        sa.CheckConstraint(
            "reference_type IS NULL OR reference_type IN ('chapter','page','quote')",
            name="ck_group_messages_reference_type",
        ),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["parent_message_id"], ["group_messages.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_group_messages_group_created",
        "group_messages",
        ["group_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_group_messages_round_ref",
        "group_messages",
        ["round_id", "reference_type"],
    )
    op.create_index(
        "ix_group_messages_parent",
        "group_messages",
        ["parent_message_id"],
    )

    # RLS
    op.execute("ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE group_messages FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY group_messages_select ON group_messages
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = group_messages.group_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY group_messages_insert ON group_messages
        FOR INSERT
        WITH CHECK (
            user_id = {_UID}
            AND EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = group_messages.group_id
                  AND gm.user_id = {_UID}
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY group_messages_update ON group_messages
        FOR UPDATE
        USING (user_id = {_UID})
    """)

    op.execute("""
        CREATE POLICY group_messages_delete ON group_messages
        FOR DELETE
        USING (false)
    """)

    # ── CREATE message_reactions ──────────────────────────────────────────────
    op.create_table(
        "message_reactions",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("message_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("emoji", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["message_id"], ["group_messages.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id", "user_id", "emoji", name="uq_message_reactions_msg_user_emoji"
        ),
    )

    # RLS
    op.execute("ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE message_reactions FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY message_reactions_select ON message_reactions
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_messages msg
                JOIN group_members gm ON gm.group_id = msg.group_id
                JOIN groups g ON g.id = msg.group_id
                WHERE msg.id = message_reactions.message_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY message_reactions_insert ON message_reactions
        FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    op.execute("""
        CREATE POLICY message_reactions_update ON message_reactions
        FOR UPDATE
        USING (false)
    """)

    op.execute(f"""
        CREATE POLICY message_reactions_delete ON message_reactions
        FOR DELETE
        USING (user_id = {_UID})
    """)


def downgrade() -> None:
    # message_reactions first (FK dependency)
    op.execute("DROP POLICY IF EXISTS message_reactions_delete ON message_reactions")
    op.execute("DROP POLICY IF EXISTS message_reactions_update ON message_reactions")
    op.execute("DROP POLICY IF EXISTS message_reactions_insert ON message_reactions")
    op.execute("DROP POLICY IF EXISTS message_reactions_select ON message_reactions")
    op.execute("ALTER TABLE message_reactions DISABLE ROW LEVEL SECURITY")
    op.drop_table("message_reactions")

    op.execute("DROP POLICY IF EXISTS group_messages_delete ON group_messages")
    op.execute("DROP POLICY IF EXISTS group_messages_update ON group_messages")
    op.execute("DROP POLICY IF EXISTS group_messages_insert ON group_messages")
    op.execute("DROP POLICY IF EXISTS group_messages_select ON group_messages")
    op.execute("ALTER TABLE group_messages DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_group_messages_parent", table_name="group_messages")
    op.drop_index("ix_group_messages_round_ref", table_name="group_messages")
    op.drop_index("ix_group_messages_group_created", table_name="group_messages")
    op.drop_table("group_messages")
