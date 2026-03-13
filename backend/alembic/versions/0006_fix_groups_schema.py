"""Fix groups schema to match issue #24 spec

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

# Shared policy SQL used in both upgrade and downgrade to avoid drift
_GROUP_MEMBERS_DELETE_POLICY = """
    CREATE POLICY group_members_delete ON group_members FOR DELETE
    USING (
        user_id::text = current_setting('app.current_user_id', true)
        OR EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = group_members.group_id
            AND gm.user_id::text = current_setting('app.current_user_id', true)
            AND gm.role = 'admin'
        )
    )
"""


def upgrade() -> None:
    # ── groups ─────────────────────────────────────────────────────────────────
    # Add is_active column
    op.add_column(
        "groups",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    # Change invite_code from VARCHAR(8) to TEXT
    op.alter_column(
        "groups",
        "invite_code",
        type_=sa.Text(),
        existing_type=sa.String(8),
        existing_nullable=False,
    )

    # ── group_members ──────────────────────────────────────────────────────────
    # Drop existing FKs and recreate with ON DELETE CASCADE
    op.drop_constraint(
        "group_members_user_id_fkey", "group_members", type_="foreignkey"
    )
    op.drop_constraint(
        "group_members_group_id_fkey", "group_members", type_="foreignkey"
    )
    op.create_foreign_key(
        "group_members_user_id_fkey",
        "group_members",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "group_members_group_id_fkey",
        "group_members",
        "groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Drop RLS policy that depends on "role" before altering column type
    op.execute("DROP POLICY IF EXISTS group_members_delete ON group_members")

    # Change role from VARCHAR(10) to TEXT
    op.alter_column(
        "group_members",
        "role",
        type_=sa.Text(),
        existing_type=sa.String(10),
        existing_nullable=False,
        existing_server_default="member",
    )

    # Recreate group_members_delete policy with same logic
    op.execute(_GROUP_MEMBERS_DELETE_POLICY)

    # Add CHECK constraint on role
    op.create_check_constraint(
        "ck_group_members_role",
        "group_members",
        "role IN ('admin', 'member')",
    )

    # Rename created_at -> joined_at
    op.alter_column(
        "group_members",
        "created_at",
        new_column_name="joined_at",
    )

    # Drop updated_at
    op.drop_column("group_members", "updated_at")

    # ── RLS: update groups_select to filter inactive groups ─────────────────
    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute("""
        CREATE POLICY groups_select ON groups FOR SELECT
        USING (
            (is_active = true AND current_setting('app.current_user_id', true) != '')
            OR created_by::text = current_setting('app.current_user_id', true)
        )
    """)

    # ── RLS: update group_members_select to exclude inactive groups ─────────
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute("""
        CREATE POLICY group_members_select ON group_members FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = group_members.group_id
                AND gm.user_id::text = current_setting('app.current_user_id', true)
                AND g.is_active = true
            )
        )
    """)


def downgrade() -> None:
    # ── group_members ──────────────────────────────────────────────────────────
    # Re-add updated_at
    op.add_column(
        "group_members",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Rename joined_at -> created_at
    op.alter_column(
        "group_members",
        "joined_at",
        new_column_name="created_at",
    )

    # Drop CHECK constraint on role
    op.drop_constraint("ck_group_members_role", "group_members", type_="check")

    # Drop RLS policy that depends on "role" before reverting column type
    op.execute("DROP POLICY IF EXISTS group_members_delete ON group_members")

    # Revert role from TEXT to VARCHAR(10)
    op.alter_column(
        "group_members",
        "role",
        type_=sa.String(10),
        existing_type=sa.Text(),
        existing_nullable=False,
        existing_server_default="member",
    )

    # Recreate group_members_delete policy (original from 0005)
    op.execute("""
        CREATE POLICY group_members_delete ON group_members FOR DELETE
        USING (
            user_id::text = current_setting('app.current_user_id', true)
            OR EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = group_members.group_id
                AND gm.user_id::text = current_setting('app.current_user_id', true)
                AND gm.role = 'admin'
            )
        )
    """)

    # Drop CASCADE FKs and recreate without CASCADE
    op.drop_constraint(
        "group_members_group_id_fkey", "group_members", type_="foreignkey"
    )
    op.drop_constraint(
        "group_members_user_id_fkey", "group_members", type_="foreignkey"
    )
    op.create_foreign_key(
        "group_members_user_id_fkey",
        "group_members",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "group_members_group_id_fkey",
        "group_members",
        "groups",
        ["group_id"],
        ["id"],
    )

    # ── RLS: restore original policies before dropping is_active ──────────────
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute("""
        CREATE POLICY group_members_select ON group_members FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = group_members.group_id
                AND gm.user_id::text = current_setting('app.current_user_id', true)
            )
        )
    """)

    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute("""
        CREATE POLICY groups_select ON groups FOR SELECT
        USING (current_setting('app.current_user_id', true) != '')
    """)

    # ── groups ─────────────────────────────────────────────────────────────────
    # Revert invite_code from TEXT to VARCHAR(8)
    op.alter_column(
        "groups",
        "invite_code",
        type_=sa.String(8),
        existing_type=sa.Text(),
        existing_nullable=False,
    )

    # Drop is_active
    op.drop_column("groups", "is_active")
