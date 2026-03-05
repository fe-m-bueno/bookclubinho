"""add groups and group_members tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "groups",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("photo_url", sa.Text(), nullable=True),
        sa.Column("invite_code", sa.String(8), nullable=False),
        sa.Column("max_members", sa.Integer(), server_default=sa.text("8"), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_groups_invite_code", "groups", ["invite_code"], unique=True)

    op.create_table(
        "group_members",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("group_id", sa.UUID(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("role", sa.String(10), server_default="member", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "group_id", name="uq_group_members_user_group"),
    )
    op.create_index("ix_group_members_user_id", "group_members", ["user_id"])
    op.create_index("ix_group_members_group_id", "group_members", ["group_id"])


def downgrade() -> None:
    op.drop_index("ix_group_members_group_id", table_name="group_members")
    op.drop_index("ix_group_members_user_id", table_name="group_members")
    op.drop_table("group_members")
    op.drop_index("ix_groups_invite_code", table_name="groups")
    op.drop_table("groups")
