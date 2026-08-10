"""make every RLS policy null-safe: nullif around current_setting before ::uuid

Revision ID: 0026
Revises: 0025
Create Date: 2026-08-10

O bug que impedia RLS de algum dia ser ligado, e que nenhum teste podia pegar
porque o app conecta como superusuário — e superusuário não avalia política.

`set_config(..., is_local := true)` some no fim da transação, mas a GUC **não
volta a não existir**: ela passa a valer string vazia. Verificado em Postgres 16:

    BEGIN; SELECT current_setting('app.x', true);  -- NULL
           SELECT set_config('app.x','abc',true); COMMIT;
    SELECT current_setting('app.x', true);         -- '' (não NULL)

Como as conexões vêm de pool, a partir da *segunda* requisição servida por uma
mesma conexão o valor lido é `''`. E `''::uuid` não é "não casa nenhuma linha":
é `invalid input syntax for type uuid: ""`, erro que aborta a transação inteira.
Ou seja, sob um papel comum, toda requisição sem usuário no contexto — a partir
da segunda na conexão — morreria em erro de banco, não em 403.

Eram 63 políticas em 20 tabelas, todas escritas com o mesmo molde desde a 0005.
A correção é `nullif(current_setting(...), '')::uuid`, que devolve NULL e faz a
comparação simplesmente não casar, como sempre foi a intenção.

A reescrita é programática de propósito: transcrever 63 expressões à mão é
oferecer uma chance de errar uma e deixar exatamente o buraco que isto fecha.
O texto de cada política vem do próprio catálogo, com uma substituição de
subexpressão e nada mais.
"""

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

_UNSAFE = "(current_setting('app.current_user_id'::text, true))::uuid"
_SAFE = "(NULLIF(current_setting('app.current_user_id'::text, true), ''::text))::uuid"

# polcmd do catálogo -> palavra do CREATE POLICY
_CMD = {"r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE", "*": "ALL"}

_LISTA = """
    SELECT p.polname,
           c.relname,
           p.polcmd,
           pg_get_expr(p.polqual, p.polrelid)      AS usando,
           pg_get_expr(p.polwithcheck, p.polrelid) AS checando
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
"""


def _reescreve(de: str, para: str) -> None:
    conexao = op.get_bind()
    for polname, relname, polcmd, usando, checando in conexao.exec_driver_sql(_LISTA).fetchall():
        if de not in (usando or "") and de not in (checando or ""):
            continue

        novo_usando = (usando or "").replace(de, para) or None
        novo_checando = (checando or "").replace(de, para) or None

        # `polcmd` é do tipo "char" do Postgres, que o driver entrega como bytes.
        cmd = polcmd.decode() if isinstance(polcmd, bytes) else polcmd

        partes = [f'CREATE POLICY "{polname}" ON "{relname}" FOR {_CMD[cmd]}']
        if novo_usando:
            partes.append(f"USING ({novo_usando})")
        if novo_checando:
            partes.append(f"WITH CHECK ({novo_checando})")

        op.execute(f'DROP POLICY "{polname}" ON "{relname}"')
        op.execute(" ".join(partes))


def upgrade() -> None:
    _reescreve(_UNSAFE, _SAFE)


def downgrade() -> None:
    _reescreve(_SAFE, _UNSAFE)
