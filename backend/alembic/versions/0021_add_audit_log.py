"""add audit_log table

Revision ID: 0021
Revises: 0020
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=True),
        sa.Column("resource_id", sa.UUID(), nullable=True),
        sa.Column("ip_hash", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_audit_log_user_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
    )

    # Índices para queries frequentes
    op.create_index("ix_audit_log_action_created", "audit_log", ["action", "created_at"])
    op.create_index("ix_audit_log_user_id", "audit_log", ["user_id"])
    op.create_index("ix_audit_log_user_id_created", "audit_log", ["user_id", "created_at"])
    op.create_index(
        "ix_audit_log_resource", "audit_log", ["resource_type", "resource_id", "created_at"]
    )

    # RLS — usuários só lêem seus próprios logs de auditoria
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_log FORCE ROW LEVEL SECURITY")

    # SELECT: usuário só vê seus próprios registros
    op.execute(
        f"CREATE POLICY audit_log_select ON audit_log FOR SELECT USING ("
        f"  user_id = {_UID}"
        f")"
    )
    # INSERT: o backend insere com qualquer user_id (incluindo NULL para eventos de sistema)
    # A política de INSERT é permissiva — a restrição é no UPDATE/DELETE (não permitidos)
    op.execute(
        "CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true)"
    )
    # UPDATE e DELETE são bloqueados — audit_log é imutável por design
    # (sem políticas = bloqueio total por padrão quando RLS está ativo)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS audit_log_insert ON audit_log")
    op.execute("DROP POLICY IF EXISTS audit_log_select ON audit_log")

    op.drop_index("ix_audit_log_resource", table_name="audit_log")
    op.drop_index("ix_audit_log_user_id_created", table_name="audit_log")
    op.drop_index("ix_audit_log_user_id", table_name="audit_log")
    op.drop_index("ix_audit_log_action_created", table_name="audit_log")
    op.drop_table("audit_log")
