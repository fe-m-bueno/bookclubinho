"""make RLS survivable for a non-superuser role: explicit auth-lookup hatch

Revision ID: 0025
Revises: 0024
Create Date: 2026-08-10

Hoje o app conecta como superusuário, e superusuário **ignora RLS** — inclusive
com `FORCE ROW LEVEL SECURITY`. Ou seja: as políticas escritas desde a 0005
nunca chegaram a ser um portão, só documentação executável.

Trocar o papel do banco por um comum, porém, quebraria a autenticação inteira,
e por um motivo estrutural: as consultas que *estabelecem* identidade rodam
antes de existir identidade. `authenticate_user` lê `users` por e-mail sem
`app.current_user_id` setado; a política manda não devolver linha nenhuma;
o login passa a responder "credenciais inválidas" para todo mundo. Verificado
em Postgres 16 com um papel sem BYPASSRLS: a mesma query devolve 0 linhas.

Esta migration abre uma porta nomeada para exatamente esse conjunto de
consultas: `app.auth_lookup = 'on'`, escopado à transação como o
`app.current_user_id` já é. Quem liga é `deps.get_session` (só em requisição
sob `/api/v1/auth`, e só quando não há usuário) e `pat.resolve_token` (que
precisa dela em qualquer rota, e a desliga logo em seguida).

Nada aqui muda o comportamento enquanto o papel for superusuário: a porta só
importa para quem RLS de fato prende. Isso é de propósito — deixa a troca do
`DATABASE_URL` para um papel comum ser um passo de configuração reversível, e
não um deploy de código. Ver docs/RUNBOOK.md.
"""

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None

_UID = "nullif(current_setting('app.current_user_id', true), '')::uuid"
_AUTHED = "current_setting('app.current_user_id', true) != ''"
# `coalesce` porque `current_setting(..., true)` devolve NULL — e não '' —
# quando a chave nunca foi setada na transação.
_AUTH_LOOKUP = "coalesce(current_setting('app.auth_lookup', true), 'off') = 'on'"


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    # SELECT: login, magic link, OAuth e registro leem por e-mail sem contexto.
    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute(
        f"CREATE POLICY users_select ON users FOR SELECT USING ("
        f"  id = {_UID} OR "
        f"  (is_active = true AND {_AUTHED}) OR "
        f"  {_AUTH_LOOKUP}"
        f")"
    )

    # UPDATE: verificação de e-mail e vínculo de conta OAuth escrevem no usuário
    # antes de ele ter sessão.
    op.execute("DROP POLICY IF EXISTS users_update ON users")
    op.execute(
        f"CREATE POLICY users_update ON users FOR UPDATE USING (id = {_UID} OR {_AUTH_LOOKUP})"
    )

    # ── user_sessions ─────────────────────────────────────────────────────────
    # O refresh acha a sessão pelo JTI antes de saber de quem ela é.
    for action, clause in (("SELECT", "USING"), ("UPDATE", "USING")):
        op.execute(f"DROP POLICY IF EXISTS user_sessions_{action.lower()} ON user_sessions")
        op.execute(
            f"CREATE POLICY user_sessions_{action.lower()} ON user_sessions FOR {action} "
            f"{clause} (user_id = {_UID} OR {_AUTH_LOOKUP})"
        )
    op.execute("DROP POLICY IF EXISTS user_sessions_insert ON user_sessions")
    op.execute(
        f"CREATE POLICY user_sessions_insert ON user_sessions FOR INSERT "
        f"WITH CHECK (user_id = {_UID} OR {_AUTH_LOOKUP})"
    )

    # ── audit_log ─────────────────────────────────────────────────────────────
    # A política de INSERT já é `WITH CHECK (true)`, e mesmo assim o INSERT
    # falhava: o `RETURNING` que o ORM usa para trazer `id` e `created_at` é
    # verificado contra a política de **SELECT**, não a de INSERT. Sem isto, sob
    # papel comum, todo `login_failed` e todo `register` sumiam do audit —
    # silenciosamente, porque `log_event` engole o próprio erro por design.
    #
    # As quatro chamadas que gravam sem `user_id` (REGISTER, LOGIN_FAILED,
    # MAGIC_LINK_SENT, TOKEN_REFRESH) estão todas sob `/api/v1/auth`, onde a
    # porta está aberta. Fora dali sempre há usuário no contexto, e aí a
    # cláusula original já basta.
    op.execute("DROP POLICY IF EXISTS audit_log_select ON audit_log")
    op.execute(f"CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (user_id = {_UID} OR {_AUTH_LOOKUP})")

    # ── personal_access_tokens ────────────────────────────────────────────────
    # A resolução do Bearer procura por hash antes de haver dono no contexto,
    # e carimba `last_used_at` na mesma transação.
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_select ON personal_access_tokens")
    op.execute(
        f"CREATE POLICY personal_access_tokens_select ON personal_access_tokens FOR SELECT "
        f"USING (user_id = {_UID} OR {_AUTH_LOOKUP})"
    )
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_update ON personal_access_tokens")
    op.execute(
        f"CREATE POLICY personal_access_tokens_update ON personal_access_tokens FOR UPDATE "
        f"USING (user_id = {_UID} OR {_AUTH_LOOKUP})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS audit_log_select ON audit_log")
    op.execute(f"CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (user_id = {_UID})")

    op.execute("DROP POLICY IF EXISTS personal_access_tokens_update ON personal_access_tokens")
    op.execute(
        f"CREATE POLICY personal_access_tokens_update ON personal_access_tokens FOR UPDATE USING (user_id = {_UID})"
    )
    op.execute("DROP POLICY IF EXISTS personal_access_tokens_select ON personal_access_tokens")
    op.execute(
        f"CREATE POLICY personal_access_tokens_select ON personal_access_tokens FOR SELECT USING (user_id = {_UID})"
    )

    op.execute("DROP POLICY IF EXISTS user_sessions_insert ON user_sessions")
    op.execute(f"CREATE POLICY user_sessions_insert ON user_sessions FOR INSERT WITH CHECK (user_id = {_UID})")
    op.execute("DROP POLICY IF EXISTS user_sessions_update ON user_sessions")
    op.execute(f"CREATE POLICY user_sessions_update ON user_sessions FOR UPDATE USING (user_id = {_UID})")
    op.execute("DROP POLICY IF EXISTS user_sessions_select ON user_sessions")
    op.execute(f"CREATE POLICY user_sessions_select ON user_sessions FOR SELECT USING (user_id = {_UID})")

    op.execute("DROP POLICY IF EXISTS users_update ON users")
    op.execute(f"CREATE POLICY users_update ON users FOR UPDATE USING (id::text = current_setting('app.current_user_id', true))")

    op.execute("DROP POLICY IF EXISTS users_select ON users")
    op.execute(
        f"CREATE POLICY users_select ON users FOR SELECT USING ("
        f"  id = {_UID} OR "
        f"  (is_active = true AND {_AUTHED})"
        f")"
    )
