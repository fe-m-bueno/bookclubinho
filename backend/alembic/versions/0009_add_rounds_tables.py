"""add rounds, round_nominations and round_votes tables

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

# Helper: cast the session variable to UUID once, compare natively
_UID = "current_setting('app.current_user_id', true)::uuid"
_UID_SET = "current_setting('app.current_user_id', true) != ''"


def upgrade() -> None:
    # ── rounds ────────────────────────────────────────────────────────────────
    op.create_table(
        "rounds",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            sa.UUID(),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("book_id", sa.Text(), nullable=True),
        sa.Column("book_title", sa.Text(), nullable=True),
        sa.Column("book_author", sa.Text(), nullable=True),
        sa.Column("book_cover_url", sa.Text(), nullable=True),
        sa.Column("book_page_count", sa.Integer(), nullable=True),
        sa.Column("book_genres", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            server_default="nominating",
            nullable=False,
        ),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("tiebreak_info", postgresql.JSONB(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "round_number", name="uq_rounds_group_round_number"),
        sa.CheckConstraint(
            "status IN ('nominating', 'voting', 'reading', 'reviewing', 'finished')",
            name="ck_rounds_status",
        ),
    )
    op.create_index("ix_rounds_group_id", "rounds", ["group_id"])
    op.create_index("ix_rounds_group_id_status", "rounds", ["group_id", "status"])

    # ── round_nominations ─────────────────────────────────────────────────────
    op.create_table(
        "round_nominations",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "round_id",
            sa.UUID(),
            sa.ForeignKey("rounds.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("book_id", sa.Text(), nullable=False),
        sa.Column("book_title", sa.Text(), nullable=False),
        sa.Column("book_author", sa.Text(), nullable=True),
        sa.Column("book_cover_url", sa.Text(), nullable=True),
        sa.Column("book_page_count", sa.Integer(), nullable=True),
        sa.Column("pitch", sa.Text(), nullable=True),
        sa.Column(
            "nominated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "round_id",
            "user_id",
            "book_id",
            name="uq_round_nominations_round_user_book",
        ),
        sa.CheckConstraint(
            "pitch IS NULL OR char_length(pitch) <= 280",
            name="ck_round_nominations_pitch_length",
        ),
    )
    op.create_index("ix_round_nominations_round_id", "round_nominations", ["round_id"])
    op.create_index("ix_round_nominations_user_id", "round_nominations", ["user_id"])

    # ── round_votes ───────────────────────────────────────────────────────────
    op.create_table(
        "round_votes",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "round_id",
            sa.UUID(),
            sa.ForeignKey("rounds.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "nomination_id",
            sa.UUID(),
            sa.ForeignKey("round_nominations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "voted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("round_id", "user_id", name="uq_round_votes_round_user"),
    )
    op.create_index("ix_round_votes_round_id", "round_votes", ["round_id"])
    op.create_index("ix_round_votes_user_id", "round_votes", ["user_id"])
    op.create_index("ix_round_votes_nomination_id", "round_votes", ["nomination_id"])

    # ── RLS: rounds ───────────────────────────────────────────────────────────
    op.execute("ALTER TABLE rounds ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE rounds FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY rounds_select ON rounds FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = rounds.group_id
                AND gm.user_id = {_UID}
                AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY rounds_insert ON rounds FOR INSERT
        WITH CHECK (
            created_by = {_UID}
            AND EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = rounds.group_id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY rounds_update ON rounds FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = rounds.group_id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY rounds_delete ON rounds FOR DELETE
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                WHERE gm.group_id = rounds.group_id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)

    # ── RLS: round_nominations ────────────────────────────────────────────────
    op.execute("ALTER TABLE round_nominations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE round_nominations FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY round_nominations_select ON round_nominations FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM rounds r
                JOIN group_members gm ON gm.group_id = r.group_id
                JOIN groups g ON g.id = r.group_id
                WHERE r.id = round_nominations.round_id
                AND gm.user_id = {_UID}
                AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY round_nominations_insert ON round_nominations FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    op.execute(f"""
        CREATE POLICY round_nominations_update ON round_nominations FOR UPDATE
        USING (user_id = {_UID})
    """)

    op.execute(f"""
        CREATE POLICY round_nominations_delete ON round_nominations FOR DELETE
        USING (
            user_id = {_UID}
            OR EXISTS (
                SELECT 1 FROM rounds r
                JOIN group_members gm ON gm.group_id = r.group_id
                WHERE r.id = round_nominations.round_id
                AND gm.user_id = {_UID}
                AND gm.role = 'admin'
            )
        )
    """)

    # ── RLS: round_votes ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE round_votes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE round_votes FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY round_votes_select ON round_votes FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM rounds r
                JOIN group_members gm ON gm.group_id = r.group_id
                JOIN groups g ON g.id = r.group_id
                WHERE r.id = round_votes.round_id
                AND gm.user_id = {_UID}
                AND g.is_active = true
            )
        )
    """)

    op.execute(f"""
        CREATE POLICY round_votes_insert ON round_votes FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    # UPDATE bloqueado por design — mudar voto = DELETE + re-INSERT
    op.execute("""
        CREATE POLICY round_votes_update ON round_votes FOR UPDATE
        USING (false)
    """)

    op.execute(f"""
        CREATE POLICY round_votes_delete ON round_votes FOR DELETE
        USING (user_id = {_UID})
    """)


def downgrade() -> None:
    # ── round_votes ───────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS round_votes_delete ON round_votes")
    op.execute("DROP POLICY IF EXISTS round_votes_update ON round_votes")
    op.execute("DROP POLICY IF EXISTS round_votes_insert ON round_votes")
    op.execute("DROP POLICY IF EXISTS round_votes_select ON round_votes")
    op.execute("ALTER TABLE round_votes DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_round_votes_nomination_id", table_name="round_votes")
    op.drop_index("ix_round_votes_user_id", table_name="round_votes")
    op.drop_index("ix_round_votes_round_id", table_name="round_votes")
    op.drop_table("round_votes")

    # ── round_nominations ─────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS round_nominations_delete ON round_nominations")
    op.execute("DROP POLICY IF EXISTS round_nominations_update ON round_nominations")
    op.execute("DROP POLICY IF EXISTS round_nominations_insert ON round_nominations")
    op.execute("DROP POLICY IF EXISTS round_nominations_select ON round_nominations")
    op.execute("ALTER TABLE round_nominations DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_round_nominations_user_id", table_name="round_nominations")
    op.drop_index("ix_round_nominations_round_id", table_name="round_nominations")
    op.drop_table("round_nominations")

    # ── rounds ────────────────────────────────────────────────────────────────
    op.execute("DROP POLICY IF EXISTS rounds_delete ON rounds")
    op.execute("DROP POLICY IF EXISTS rounds_update ON rounds")
    op.execute("DROP POLICY IF EXISTS rounds_insert ON rounds")
    op.execute("DROP POLICY IF EXISTS rounds_select ON rounds")
    op.execute("ALTER TABLE rounds DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_rounds_group_id_status", table_name="rounds")
    op.drop_index("ix_rounds_group_id", table_name="rounds")
    op.drop_table("rounds")
