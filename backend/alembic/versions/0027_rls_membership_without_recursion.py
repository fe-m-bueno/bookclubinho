"""break the recursive group_members policies with SECURITY DEFINER helpers

Revision ID: 0027
Revises: 0026
Create Date: 2026-08-10

`group_members_select/update/delete` respondiam "você participa deste grupo?"
consultando `group_members` de dentro da própria política de `group_members`.
Sob RLS isso é `infinite recursion detected in policy` — erro duro, não
resultado vazio. E como 31 políticas de outras tabelas checam participação
lendo `group_members`, caíam junto: grupo, chat, rodada, review e encontro.

A pergunta sai da política e vai para duas funções `SECURITY DEFINER`, que
rodam como o dono da tabela e por isso não reentram na política.

## Por que `NO FORCE` em `group_members`

`FORCE ROW LEVEL SECURITY` aplica as políticas **também ao dono da tabela**.
Com ele ligado, a função `SECURITY DEFINER` do dono continua presa — e o efeito
é pior que erro: ela devolve `false` em silêncio, negando acesso a quem tem.
Verificado em Postgres 16.

Tirar o `FORCE` não afrouxa nada para a aplicação, e isso é o ponto: papel que
não é dono está sujeito a RLS **sempre**, com ou sem `FORCE`. Verificado no
mesmo ambiente, com o app num papel não-dono:

    sem contexto      -> 0 linhas de group_members
    membro do grupo   -> 2 linhas (os dois membros)
    usuário estranho  -> 0 linhas

O único cenário que o `FORCE` cobria é o app conectando **como dono** — que é
exatamente o que a separação de papéis elimina. Ver docs/RUNBOOK.md.

O raio fica no menor possível: só `group_members` perde o `FORCE`. O teste de
`groups.is_active` sai de dentro da função e vai para a própria política, onde é
avaliado como o app e passa pela `groups_select` normal — assim `groups` mantém
o `FORCE`.

## Ordem

As políticas recursivas têm de cair **antes** das funções serem criadas: o
Postgres planeja o corpo de uma função SQL na criação, e o planejamento já
tromba na recursão. Criar a função primeiro falha com o mesmo erro.
"""

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None

_UID = "nullif(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    # ── 1. As recursivas saem primeiro (ver "Ordem" no topo) ──────────────────
    for acao in ("select", "update", "delete"):
        op.execute(f"DROP POLICY IF EXISTS group_members_{acao} ON group_members")

    # ── 2. O dono precisa escapar da própria política para poder responder ────
    op.execute("ALTER TABLE group_members NO FORCE ROW LEVEL SECURITY")

    # ── 3. As duas perguntas, agora fora do alcance da política ───────────────
    # `STABLE` para o planejador poder reaproveitar o resultado dentro da mesma
    # query; `search_path` fixo porque `SECURITY DEFINER` sem isso é vetor de
    # captura de nome.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_is_group_member(gid uuid, uid uuid)
        RETURNS boolean
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.group_id = gid AND gm.user_id = uid
          )
        $$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION app_is_group_admin(gid uuid, uid uuid)
        RETURNS boolean
        LANGUAGE sql
        SECURITY DEFINER
        STABLE
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM group_members gm
             WHERE gm.group_id = gid AND gm.user_id = uid AND gm.role = 'admin'
          )
        $$
        """
    )

    # ── 4. As políticas, sem auto-referência ──────────────────────────────────
    # O `is_active` do grupo continua valendo, só que avaliado aqui — como o
    # app, pela `groups_select` — em vez de dentro da função. É o que permite a
    # `groups` seguir com `FORCE`.
    # `user_id = uid` na frente não é redundância: é o que faz o `RETURNING` do
    # próprio INSERT passar. Ao criar o grupo, o criador insere a sua linha de
    # participação e o ORM pede `RETURNING` — que o Postgres verifica contra a
    # política de SELECT. Nesse instante `app_is_group_member` ainda não vê a
    # linha, porque é `STABLE` e lê o snapshot do comando, não o que o próprio
    # comando está inserindo. Sem esta cláusula, criar grupo falha com "new row
    # violates row-level security policy".
    #
    # E é verdade por si só: ninguém precisa de política para saber que participa
    # de um grupo em que participa.
    op.execute(
        f"CREATE POLICY group_members_select ON group_members FOR SELECT USING ("
        f"  user_id = {_UID}"
        f"  OR ("
        f"    app_is_group_member(group_id, {_UID})"
        f"    AND EXISTS (SELECT 1 FROM groups g WHERE g.id = group_id AND g.is_active = true)"
        f"  )"
        f")"
    )
    for acao in ("UPDATE", "DELETE"):
        op.execute(
            f"CREATE POLICY group_members_{acao.lower()} ON group_members FOR {acao} USING ("
            f"  user_id = {_UID} OR app_is_group_admin(group_id, {_UID})"
            f")"
        )


def downgrade() -> None:
    for acao in ("select", "update", "delete"):
        op.execute(f"DROP POLICY IF EXISTS group_members_{acao} ON group_members")

    op.execute("DROP FUNCTION IF EXISTS app_is_group_admin(uuid, uuid)")
    op.execute("DROP FUNCTION IF EXISTS app_is_group_member(uuid, uuid)")

    op.execute("ALTER TABLE group_members FORCE ROW LEVEL SECURITY")

    # Volta às recursivas da 0006 — que só não explodem porque o papel do app
    # ignora RLS. É o estado anterior, defeito incluído.
    op.execute(
        f"CREATE POLICY group_members_select ON group_members FOR SELECT USING ("
        f"  EXISTS (SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id"
        f"          WHERE gm.group_id = group_members.group_id AND gm.user_id = {_UID}"
        f"            AND g.is_active = true)"
        f")"
    )
    for acao in ("UPDATE", "DELETE"):
        op.execute(
            f"CREATE POLICY group_members_{acao.lower()} ON group_members FOR {acao} USING ("
            f"  user_id = {_UID} OR"
            f"  EXISTS (SELECT 1 FROM group_members gm"
            f"          WHERE gm.group_id = group_members.group_id AND gm.user_id = {_UID}"
            f"            AND gm.role = 'admin')"
            f")"
        )
