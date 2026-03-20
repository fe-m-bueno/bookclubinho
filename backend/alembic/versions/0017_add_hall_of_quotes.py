"""add hall_of_quotes and quote_votes tables

Revision ID: 0017
Revises: 0016
Create Date: 2026-03-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── 1. hall_of_quotes ──────────────────────────────────────────────────────
    op.create_table(
        "hall_of_quotes",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("round_id", sa.UUID(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("quote_text", sa.Text(), nullable=False),
        sa.Column("page_reference", sa.Text(), nullable=True),
        sa.Column("book_title", sa.Text(), nullable=False),
        sa.Column("book_author", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["group_id"], ["groups.id"], name="fk_hall_of_quotes_group_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["round_id"], ["rounds.id"], name="fk_hall_of_quotes_round_id", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_hall_of_quotes_user_id"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_hall_of_quotes"),
    )
    op.create_index("ix_hall_of_quotes_group_id", "hall_of_quotes", ["group_id"])
    op.create_index("ix_hall_of_quotes_user_id", "hall_of_quotes", ["user_id"])

    # ── 2. quote_votes ─────────────────────────────────────────────────────────
    op.create_table(
        "quote_votes",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("quote_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["quote_id"],
            ["hall_of_quotes.id"],
            name="fk_quote_votes_quote_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_quote_votes_user_id"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_quote_votes"),
        sa.UniqueConstraint("quote_id", "user_id", name="uq_quote_votes_quote_user"),
    )
    op.create_index("ix_quote_votes_quote_id", "quote_votes", ["quote_id"])
    op.create_index("ix_quote_votes_user_id", "quote_votes", ["user_id"])

    # ── 3. RLS — hall_of_quotes ────────────────────────────────────────────────
    op.execute("ALTER TABLE hall_of_quotes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE hall_of_quotes FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY hall_of_quotes_select ON hall_of_quotes FOR SELECT USING ("
        f"  EXISTS ("
        f"    SELECT 1 FROM group_members gm "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE gm.group_id = hall_of_quotes.group_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        f"CREATE POLICY hall_of_quotes_insert ON hall_of_quotes FOR INSERT WITH CHECK ("
        f"  user_id = {_UID} AND EXISTS ("
        f"    SELECT 1 FROM group_members gm "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE gm.group_id = hall_of_quotes.group_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        "CREATE POLICY hall_of_quotes_update ON hall_of_quotes FOR UPDATE USING (false)"
    )
    op.execute(
        f"CREATE POLICY hall_of_quotes_delete ON hall_of_quotes FOR DELETE USING ("
        f"  user_id = {_UID}"
        f")"
    )

    # ── 4. RLS — quote_votes ───────────────────────────────────────────────────
    op.execute("ALTER TABLE quote_votes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE quote_votes FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY quote_votes_select ON quote_votes FOR SELECT USING ("
        f"  EXISTS ("
        f"    SELECT 1 FROM hall_of_quotes hq "
        f"    JOIN group_members gm ON gm.group_id = hq.group_id "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE hq.id = quote_votes.quote_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        f"CREATE POLICY quote_votes_insert ON quote_votes FOR INSERT WITH CHECK ("
        f"  user_id = {_UID} AND EXISTS ("
        f"    SELECT 1 FROM hall_of_quotes hq "
        f"    JOIN group_members gm ON gm.group_id = hq.group_id "
        f"    JOIN groups g ON g.id = gm.group_id "
        f"    WHERE hq.id = quote_votes.quote_id "
        f"    AND gm.user_id = {_UID} "
        f"    AND g.is_active = true"
        f"  )"
        f")"
    )
    op.execute(
        "CREATE POLICY quote_votes_update ON quote_votes FOR UPDATE USING (false)"
    )
    op.execute(
        f"CREATE POLICY quote_votes_delete ON quote_votes FOR DELETE USING ("
        f"  user_id = {_UID}"
        f")"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS quote_votes_delete ON quote_votes")
    op.execute("DROP POLICY IF EXISTS quote_votes_update ON quote_votes")
    op.execute("DROP POLICY IF EXISTS quote_votes_insert ON quote_votes")
    op.execute("DROP POLICY IF EXISTS quote_votes_select ON quote_votes")
    op.execute("DROP POLICY IF EXISTS hall_of_quotes_delete ON hall_of_quotes")
    op.execute("DROP POLICY IF EXISTS hall_of_quotes_update ON hall_of_quotes")
    op.execute("DROP POLICY IF EXISTS hall_of_quotes_insert ON hall_of_quotes")
    op.execute("DROP POLICY IF EXISTS hall_of_quotes_select ON hall_of_quotes")
    op.drop_table("quote_votes")
    op.drop_table("hall_of_quotes")
