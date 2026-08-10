"""stop letting any authenticated user read any group (and its invite_code)

Revision ID: 0028
Revises: 0027
Create Date: 2026-08-10

`groups_select` vinha da 0005 assim:

    USING (is_active = true AND current_setting('app.current_user_id', true) != '')

Ou seja: **qualquer usuário autenticado lia qualquer grupo ativo.** E RLS filtra
linha, não coluna — então isso incluía o `invite_code`, que é a credencial de
entrada no clube. Era a única tabela em que ligar RLS não somava nada: a
política existia e autorizava todo mundo.

Nenhum endpoint expõe isso hoje (os que devolvem grupo passam por
`GroupMemberDep`, e o `invite_code` só sai para admin), então não é uma
vulnerabilidade explorável pela API. É a ausência da segunda linha de defesa
exatamente onde ela mais serviria: se um endpoint futuro devolver um grupo sem
checar participação, o vazamento é o código de convite de todos os clubes.

A política passa a ser: **criador, ou membro, ou uma porta nomeada.**

## As três leituras legítimas de grupo sem participação

Todas fora de uma sessão de membro, todas abrindo `app.group_lookup`
explicitamente (`rls.group_lookup`):

1. `validate_group_code` — entrar num clube é ler um grupo do qual ainda não se
   participa. Quem prova o direito é conhecer o código.
2. `_generate_unique_code` — colisão precisa ser detectada contra todos os
   grupos, inclusive os alheios. Sem isso todo código pareceria livre e a
   unicidade cairia no constraint, virando 500 em vez de nova tentativa.
3. `populate_shelf_cache` — background task, roda sem usuário nenhum.

## Por que a porta também abre `group_members`

`join_group` decide "já é membro?" e "está cheio?" a partir de `group.members`,
carregado no mesmo `selectinload`. Com os membros escondidos, as duas checagens
leem lista vazia: a segunda **deixaria passar do `max_members`**. A porta cobre
`group_members` para que a contagem seja real — é leitura, e só durante o fluxo
de entrada.
"""

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None

_UID = "nullif(current_setting('app.current_user_id', true), '')::uuid"
_GROUP_LOOKUP = "coalesce(current_setting('app.group_lookup', true), 'off') = 'on'"


def upgrade() -> None:
    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute(
        f"CREATE POLICY groups_select ON groups FOR SELECT USING ("
        f"  created_by = {_UID}"
        f"  OR app_is_group_member(id, {_UID})"
        f"  OR {_GROUP_LOOKUP}"
        f")"
    )

    # `group_members` ganha a mesma porta, e só ela — ver "Por que" no topo.
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute(
        f"CREATE POLICY group_members_select ON group_members FOR SELECT USING ("
        f"  user_id = {_UID}"
        f"  OR {_GROUP_LOOKUP}"
        f"  OR ("
        f"    app_is_group_member(group_id, {_UID})"
        f"    AND EXISTS (SELECT 1 FROM groups g WHERE g.id = group_id AND g.is_active = true)"
        f"  )"
        f")"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS group_members_select ON group_members")
    op.execute(
        f"CREATE POLICY group_members_select ON group_members FOR SELECT USING ("
        f"  user_id = {_UID}"
        f"  OR ("
        f"    app_is_group_member(group_id, {_UID})"
        f"    AND EXISTS (SELECT 1 FROM groups g WHERE g.id = group_id AND g.is_active = true)"
        f"  )"
        f")"
    )

    # Volta ao "qualquer autenticado lê qualquer grupo" da 0005 — o estado
    # anterior, buraco incluído.
    op.execute("DROP POLICY IF EXISTS groups_select ON groups")
    op.execute(
        f"CREATE POLICY groups_select ON groups FOR SELECT USING ("
        f"  (is_active = true AND current_setting('app.current_user_id', true) != '')"
        f"  OR created_by = {_UID}"
        f")"
    )
