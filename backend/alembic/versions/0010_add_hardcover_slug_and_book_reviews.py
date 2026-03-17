"""add book_hardcover_slug to round_nominations and create book_reviews table

Revision ID: 0010
Revises: 0009
Create Date: 2026-03-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── round_nominations: adicionar book_hardcover_slug ──────────────────────
    op.add_column(
        "round_nominations",
        sa.Column("book_hardcover_slug", sa.Text(), nullable=True),
    )

    # ── book_reviews (stub) ───────────────────────────────────────────────────
    op.create_table(
        "book_reviews",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("round_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_book_reviews_rating"),
        sa.ForeignKeyConstraint(["round_id"], ["rounds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("round_id", "user_id", name="uq_book_reviews_round_user"),
    )
    op.create_index("ix_book_reviews_round_id", "book_reviews", ["round_id"])
    op.create_index("ix_book_reviews_user_id", "book_reviews", ["user_id"])

    # RLS
    op.execute("ALTER TABLE book_reviews ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE book_reviews FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        CREATE POLICY book_reviews_select ON book_reviews
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

    op.execute(f"""
        CREATE POLICY book_reviews_insert ON book_reviews
        FOR INSERT
        WITH CHECK (user_id = {_UID})
    """)

    op.execute(f"""
        CREATE POLICY book_reviews_update ON book_reviews
        FOR UPDATE
        USING (user_id = {_UID})
        WITH CHECK (user_id = {_UID})
    """)

    op.execute(f"""
        CREATE POLICY book_reviews_delete ON book_reviews
        FOR DELETE
        USING (user_id = {_UID})
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS book_reviews_delete ON book_reviews")
    op.execute("DROP POLICY IF EXISTS book_reviews_update ON book_reviews")
    op.execute("DROP POLICY IF EXISTS book_reviews_insert ON book_reviews")
    op.execute("DROP POLICY IF EXISTS book_reviews_select ON book_reviews")
    op.drop_index("ix_book_reviews_user_id", table_name="book_reviews")
    op.drop_index("ix_book_reviews_round_id", table_name="book_reviews")
    op.drop_table("book_reviews")
    op.drop_column("round_nominations", "book_hardcover_slug")
