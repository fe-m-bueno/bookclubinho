"""Optimize RLS policies: cast setting to UUID instead of column to text

This allows PostgreSQL to use existing UUID indexes on user_id, created_by, etc.
instead of scanning with text-cast columns which bypass index usage.

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-13
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# Helper: cast the session variable to UUID once, compare natively
_UID = "current_setting('app.current_user_id', true)::uuid"
_UID_SET = "current_setting('app.current_user_id', true) != ''"


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute(f"""
        CREATE POLICY users_select ON users FOR SELECT
        USING (id = {_UID})
    """)

    op.execute("DROP POLICY IF EXISTS users_update ON users")
    op.execute(f"""
        CREATE POLICY users_update ON users FOR UPDATE
        USING (id = {_UID})
    """)

    # users_insert and users_delete don't reference user_id columns, skip

    # ── groups ────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute(f"""
        CREATE POLICY groups_select ON groups FOR SELECT
        USING (
            (is_active = true AND {_UID_SET})
            OR created_by = {_UID}
        )
    """)

    op.execute("DROP POLICY IF EXISTS groups_insert ON groups")
    op.execute(f"""
        CREATE POLICY groups_insert ON groups FOR INSERT
        WITH CHECK (created_by = {_UID})
    """)

    op.execute("DROP POLICY IF EXISTS groups_update ON groups")
    op.execute(f"""
        CREATE POLICY groups_update ON groups FOR UPDATE
        USING (created_by = {_UID})
    """)

    op.execute("DROP POLICY IF EXISTS groups_delete ON groups")
    op.execute(f"""
        CREATE POLICY groups_delete ON groups FOR DELETE
        USING (created_by = {_UID})
    """)

    # ── group_members ─────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_select ON group_members FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = group_members.group_id
                AND gm.user_id = {_UID}
                AND g.is_active = true
            )
        )
    """)

    op.execute("DROP POLICY IF EXISTS group_members_insert ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_insert ON group_members FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    op.execute("DROP POLICY IF EXISTS group_members_update ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_update ON group_members FOR UPDATE
        USING (user_id = {_UID})
    """)

    op.execute("DROP POLICY IF EXISTS group_members_delete ON group_members")
    op.execute(f"""
        CREATE POLICY group_members_delete ON group_members FOR DELETE
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
    # Restore ::text cast versions from migrations 0005 + 0006

    # ── group_members ─────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS group_members_delete ON group_members")
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

    op.execute("DROP POLICY IF EXISTS group_members_update ON group_members")
    op.execute("""
        CREATE POLICY group_members_update ON group_members FOR UPDATE
        USING (
            user_id::text = current_setting('app.current_user_id', true)
        )
    """)

    op.execute("DROP POLICY IF EXISTS group_members_insert ON group_members")
    op.execute("""
        CREATE POLICY group_members_insert ON group_members FOR INSERT
        WITH CHECK (
            user_id::text = current_setting('app.current_user_id', true)
        )
    """)

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

    # ── groups ────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS groups_delete ON groups")
    op.execute("""
        CREATE POLICY groups_delete ON groups FOR DELETE
        USING (created_by::text = current_setting('app.current_user_id', true))
    """)

    op.execute("DROP POLICY IF EXISTS groups_update ON groups")
    op.execute("""
        CREATE POLICY groups_update ON groups FOR UPDATE
        USING (created_by::text = current_setting('app.current_user_id', true))
    """)

    op.execute("DROP POLICY IF EXISTS groups_insert ON groups")
    op.execute("""
        CREATE POLICY groups_insert ON groups FOR INSERT
        WITH CHECK (created_by::text = current_setting('app.current_user_id', true))
    """)

    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute("""
        CREATE POLICY groups_select ON groups FOR SELECT
        USING (
            (is_active = true AND current_setting('app.current_user_id', true) != '')
            OR created_by::text = current_setting('app.current_user_id', true)
        )
    """)

    # ── users ─────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS users_update ON users")
    op.execute("""
        CREATE POLICY users_update ON users FOR UPDATE
        USING (id::text = current_setting('app.current_user_id', true))
    """)

    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute("""
        CREATE POLICY users_select ON users FOR SELECT
        USING (id::text = current_setting('app.current_user_id', true))
    """)
