"""expand book_reviews: add boolean flags, text fields, group_id, rename columns

Revision ID: 0015
Revises: 0014
Create Date: 2026-03-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    # ── 1. Add group_id (nullable first, backfill, then NOT NULL) ────────────
    op.add_column(
        "book_reviews",
        sa.Column("group_id", sa.UUID(), nullable=True),
    )
    op.execute(
        "UPDATE book_reviews SET group_id = r.group_id "
        "FROM rounds r WHERE r.id = book_reviews.round_id"
    )
    op.alter_column("book_reviews", "group_id", nullable=False)
    op.create_foreign_key(
        "fk_book_reviews_group_id",
        "book_reviews",
        "groups",
        ["group_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_book_reviews_group_id", "book_reviews", ["group_id"])

    # ── 2. Rename rating → star_rating, adjust check 1-5 → 0-5 ─────────────
    op.alter_column("book_reviews", "rating", new_column_name="star_rating")
    op.drop_constraint("ck_book_reviews_rating", "book_reviews", type_="check")
    op.create_check_constraint(
        "ck_book_reviews_star_rating",
        "book_reviews",
        "star_rating >= 0 AND star_rating <= 5",
    )

    # ── 3. Rename submitted_at → completed_at ───────────────────────────────
    op.alter_column("book_reviews", "submitted_at", new_column_name="completed_at")

    # ── 4. Add updated_at (TimestampMixin) ───────────────────────────────────
    op.add_column(
        "book_reviews",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── 5. Add boolean columns ───────────────────────────────────────────────
    for col in ("cried", "loved_it", "felt_aroused", "found_heavy", "wants_more_from_author"):
        op.add_column(
            "book_reviews",
            sa.Column(col, sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    # ── 6. Add text columns ─────────────────────────────────────────────────
    op.add_column(
        "book_reviews",
        sa.Column(
            "sincere_review",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
    )
    op.add_column("book_reviews", sa.Column("funny_oneliner", sa.Text(), nullable=True))
    op.add_column("book_reviews", sa.Column("extra_thoughts", sa.Text(), nullable=True))

    # Drop server defaults that were only needed for existing rows
    for col in ("cried", "loved_it", "felt_aroused", "found_heavy", "wants_more_from_author"):
        op.alter_column("book_reviews", col, server_default=None)
    op.alter_column("book_reviews", "sincere_review", server_default=None)

    # ── 7. Update RLS SELECT policy (simpler with direct group_id) ──────────
    op.execute("DROP POLICY IF EXISTS book_reviews_select ON book_reviews")
    op.execute(f"""
        CREATE POLICY book_reviews_select ON book_reviews
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM group_members gm
                JOIN groups g ON g.id = gm.group_id
                WHERE gm.group_id = book_reviews.group_id
                  AND gm.user_id = {_UID}
                  AND g.is_active = true
            )
        )
    """)


def downgrade() -> None:
    # Restore original RLS SELECT policy
    op.execute("DROP POLICY IF EXISTS book_reviews_select ON book_reviews")
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

    # Drop text columns
    op.drop_column("book_reviews", "extra_thoughts")
    op.drop_column("book_reviews", "funny_oneliner")
    op.drop_column("book_reviews", "sincere_review")

    # Drop boolean columns
    for col in ("wants_more_from_author", "found_heavy", "felt_aroused", "loved_it", "cried"):
        op.drop_column("book_reviews", col)

    # Drop updated_at
    op.drop_column("book_reviews", "updated_at")

    # Rename completed_at → submitted_at
    op.alter_column("book_reviews", "completed_at", new_column_name="submitted_at")

    # Rename star_rating → rating, restore check 1-5
    op.drop_constraint("ck_book_reviews_star_rating", "book_reviews", type_="check")
    op.alter_column("book_reviews", "star_rating", new_column_name="rating")
    op.create_check_constraint(
        "ck_book_reviews_rating",
        "book_reviews",
        "rating >= 1 AND rating <= 5",
    )

    # Drop group_id
    op.drop_index("ix_book_reviews_group_id", table_name="book_reviews")
    op.drop_constraint("fk_book_reviews_group_id", "book_reviews", type_="foreignkey")
    op.drop_column("book_reviews", "group_id")
