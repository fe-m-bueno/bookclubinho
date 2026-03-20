"""add badges and user_badges tables with seed data

Revision ID: 0016
Revises: 0015
Create Date: 2026-03-20
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_UID = "current_setting('app.current_user_id', true)::uuid"
_UID_SET = "current_setting('app.current_user_id', true) != ''"


def upgrade() -> None:
    # ── 1. badges ─────────────────────────────────────────────────────────────
    op.create_table(
        "badges",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("emoji", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_badges"),
        sa.UniqueConstraint("slug", name="uq_badges_slug"),
        sa.CheckConstraint(
            "category IN ('reading','social','streak','achievement','fun')",
            name="ck_badges_category",
        ),
    )

    # ── 2. user_badges ────────────────────────────────────────────────────────
    op.create_table(
        "user_badges",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("badge_id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=True),
        sa.Column("round_id", sa.UUID(), nullable=True),
        sa.Column(
            "earned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_badges_user_id"),
        sa.ForeignKeyConstraint(["badge_id"], ["badges.id"], name="fk_user_badges_badge_id"),
        sa.ForeignKeyConstraint(
            ["group_id"], ["groups.id"], name="fk_user_badges_group_id", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["round_id"], ["rounds.id"], name="fk_user_badges_round_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_user_badges"),
    )
    op.create_index("ix_user_badges_user_id", "user_badges", ["user_id"])
    op.create_index("ix_user_badges_badge_id", "user_badges", ["badge_id"])
    op.create_index("ix_user_badges_group_id", "user_badges", ["group_id"])

    # UNIQUE NULLS NOT DISTINCT requires PostgreSQL 15+
    op.execute(
        "ALTER TABLE user_badges ADD CONSTRAINT uq_user_badges_unique "
        "UNIQUE NULLS NOT DISTINCT (user_id, badge_id, group_id, round_id)"
    )

    # ── 3. RLS — badges ───────────────────────────────────────────────────────
    op.execute("ALTER TABLE badges ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE badges FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY badges_select ON badges FOR SELECT "
        f"USING ({_UID_SET})"
    )
    op.execute(
        "CREATE POLICY badges_insert ON badges FOR INSERT WITH CHECK (false)"
    )
    op.execute(
        "CREATE POLICY badges_update ON badges FOR UPDATE USING (false)"
    )
    op.execute(
        "CREATE POLICY badges_delete ON badges FOR DELETE USING (false)"
    )

    # ── 4. RLS — user_badges ──────────────────────────────────────────────────
    op.execute("ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_badges FORCE ROW LEVEL SECURITY")

    op.execute(
        f"CREATE POLICY user_badges_select ON user_badges FOR SELECT USING ("
        f"  user_id = {_UID} OR ("
        f"    group_id IS NOT NULL AND EXISTS ("
        f"      SELECT 1 FROM group_members gm "
        f"      JOIN groups g ON g.id = gm.group_id "
        f"      WHERE gm.group_id = user_badges.group_id "
        f"      AND gm.user_id = {_UID} "
        f"      AND g.is_active = true"
        f"    )"
        f"  )"
        f")"
    )
    op.execute(
        f"CREATE POLICY user_badges_insert ON user_badges FOR INSERT WITH CHECK ("
        f"  user_id = {_UID}"
        f")"
    )
    op.execute(
        "CREATE POLICY user_badges_update ON user_badges FOR UPDATE USING (false)"
    )
    op.execute(
        "CREATE POLICY user_badges_delete ON user_badges FOR DELETE USING (false)"
    )

    # ── 5. Seed badge catalog ──────────────────────────────────────────────────
    op.execute(
        """
        INSERT INTO badges (slug, name, description, emoji, category) VALUES
        ('first_blood',       'Primeiro a Terminar',    'Terminou o livro antes de todo mundo na rodada',          '\U0001fa78', 'achievement'),
        ('quote_king',        'Rei das Quotes',         'Postou mais quotes que ninguém numa rodada',              '\U0001f451', 'social'),
        ('crybaby',           'Chorão',                 'Chorou em 3 ou mais livros',                              '\U0001f62d', 'fun'),
        ('bookworm',          'Rato de Biblioteca',     'Finalizou 5 livros com o clube',                          '\U0001f41b', 'reading'),
        ('speed_reader',      'Leitor Veloz',           'Terminou o livro em menos de 7 dias',                     '\u26a1',     'reading'),
        ('social_butterfly',  'Borboleta Social',       'Mandou 100 mensagens no chat de um grupo',                '\U0001f98b', 'social'),
        ('streak_7',          'Streak de 7 Dias',       'Manteve uma sequência de leitura por 7 dias',             '\U0001f525', 'streak'),
        ('streak_30',         'Streak de 30 Dias',      'Manteve uma sequência de leitura por 30 dias',            '\U0001f525', 'streak'),
        ('streak_100',        'Streak de 100 Dias',     'Manteve uma sequência de leitura por 100 dias',           '\U0001f525', 'streak'),
        ('night_owl',         'Coruja Noturna',         'Registrou leitura depois da meia-noite 5 vezes',          '\U0001f989', 'fun'),
        ('marathon',          'Maratonista',            'Fez uma sessão de leitura de mais de 2 horas',            '\U0001f3c3', 'reading'),
        ('reviewer',          'Crítico Literário',      'Escreveu 10 reviews',                                     '\u270d\ufe0f', 'reading'),
        ('variety',           'Eclético',               'Leu livros de 5 gêneros diferentes',                      '\U0001f308', 'reading'),
        ('founder',           'Fundador',               'Criou um clube de leitura',                               '\U0001f3d7\ufe0f', 'achievement'),
        ('hot_take',          'Hot Take',               'Deu 1 estrela pra um livro que o grupo deu 4 ou mais',    '\U0001f336\ufe0f', 'fun'),
        ('romantic',          'Romântico',              'Amou 5 ou mais livros',                                   '\U0001f495', 'fun')
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_badges_delete ON user_badges")
    op.execute("DROP POLICY IF EXISTS user_badges_update ON user_badges")
    op.execute("DROP POLICY IF EXISTS user_badges_insert ON user_badges")
    op.execute("DROP POLICY IF EXISTS user_badges_select ON user_badges")
    op.execute("DROP POLICY IF EXISTS badges_delete ON badges")
    op.execute("DROP POLICY IF EXISTS badges_update ON badges")
    op.execute("DROP POLICY IF EXISTS badges_insert ON badges")
    op.execute("DROP POLICY IF EXISTS badges_select ON badges")
    op.drop_table("user_badges")
    op.drop_table("badges")
