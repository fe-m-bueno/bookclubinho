"""Fix RLS policies to allow admins to update groups and group members

groups_update: was only allowing creator to update, now allows any admin
group_members_update: was only allowing self-update, now allows admins to update

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-13
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

# Helper: cast the session variable to UUID once, compare natively
_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── groups ────────────────────────────────────────────────────────────────
    # Allow admins of the group to update it, not just the creator
    op.execute("DROP POLICY IF EXISTS groups_update ON groups")
    op.execute(f"""
        CREATE POLICY groups_update ON groups FOR UPDATE
        USING (
            created_by = {_UID}
            OR EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = groups.id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)

    # ── group_members ─────────────────────────────────────────────────────────
    # Allow admins of the group to update member roles, not just the member themselves
    op.execute("DROP POLICY IF EXISTS group_members_update ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_update ON group_members FOR UPDATE
        USING (
            user_id = {_UID}
            OR EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = group_members.group_id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)


def downgrade() -> None:
    # Restore the previous (restrictive) versions from migration 0007

    # ── group_members ─────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS group_members_update ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_update ON group_members FOR UPDATE
        USING (user_id = {_UID})
    """)

    # ── groups ────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS groups_update ON groups")
    op.execute(f"""
        CREATE POLICY groups_update ON groups FOR UPDATE
        USING (created_by = {_UID})
    """)
