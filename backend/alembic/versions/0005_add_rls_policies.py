"""Enable Row Level Security on all tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-13
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")

    # Users can only see their own row
    op.execute("""
        CREATE POLICY users_select ON users FOR SELECT
        USING (id::text = current_setting('app.current_user_id', true))
    """)

    # Users can only update their own row
    op.execute("""
        CREATE POLICY users_update ON users FOR UPDATE
        USING (id::text = current_setting('app.current_user_id', true))
    """)

    # INSERT open — registration creates the row before user_id is known
    op.execute("""
        CREATE POLICY users_insert ON users FOR INSERT
        WITH CHECK (true)
    """)

    # No direct DELETE — soft-delete via is_active
    op.execute("""
        CREATE POLICY users_delete ON users FOR DELETE
        USING (false)
    """)

    # ── groups ────────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE groups ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE groups FORCE ROW LEVEL SECURITY")

    # Any authenticated user can see groups (needed for invite code lookup)
    op.execute("""
        CREATE POLICY groups_select ON groups FOR SELECT
        USING (current_setting('app.current_user_id', true) != '')
    """)

    # Only the creator can insert (created_by must match current user)
    op.execute("""
        CREATE POLICY groups_insert ON groups FOR INSERT
        WITH CHECK (created_by::text = current_setting('app.current_user_id', true))
    """)

    # Only the creator can update
    op.execute("""
        CREATE POLICY groups_update ON groups FOR UPDATE
        USING (created_by::text = current_setting('app.current_user_id', true))
    """)

    # Only the creator can delete
    op.execute("""
        CREATE POLICY groups_delete ON groups FOR DELETE
        USING (created_by::text = current_setting('app.current_user_id', true))
    """)

    # ── group_members ─────────────────────────────────────────────────────────
    op.execute("ALTER TABLE group_members ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE group_members FORCE ROW LEVEL SECURITY")

    # Members can see other members of groups they belong to
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

    # Users can only add themselves as members
    op.execute("""
        CREATE POLICY group_members_insert ON group_members FOR INSERT
        WITH CHECK (
            user_id::text = current_setting('app.current_user_id', true)
        )
    """)

    # Members can update only their own membership
    op.execute("""
        CREATE POLICY group_members_update ON group_members FOR UPDATE
        USING (
            user_id::text = current_setting('app.current_user_id', true)
        )
    """)

    # Admin can remove anyone; members can remove themselves
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


def downgrade() -> None:
    # ── group_members ─────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS group_members_delete ON group_members")
    op.execute("DROP POLICY IF EXISTS group_members_update ON group_members")
    op.execute("DROP POLICY IF EXISTS group_members_insert ON group_members")
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute("ALTER TABLE group_members DISABLE ROW LEVEL SECURITY")

    # ── groups ────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS groups_delete ON groups")
    op.execute("DROP POLICY IF EXISTS groups_update ON groups")
    op.execute("DROP POLICY IF EXISTS groups_insert ON groups")
    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute("ALTER TABLE groups DISABLE ROW LEVEL SECURITY")

    # ── users ─────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS users_delete ON users")
    op.execute("DROP POLICY IF EXISTS users_update ON users")
    op.execute("DROP POLICY IF EXISTS users_insert ON users")
    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
