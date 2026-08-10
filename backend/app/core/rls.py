"""Row-Level Security middleware — injects current_user_id into every DB transaction."""

from __future__ import annotations

import contextvars
import uuid
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.cookies import ACCESS_TOKEN_COOKIE
from app.core.security import extract_access_token_sub

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlalchemy.engine import Connection
    from sqlalchemy.ext.asyncio import AsyncSession
    from starlette.requests import Request
    from starlette.responses import Response

_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("current_user_id", default="")
_auth_lookup_on: contextvars.ContextVar[bool] = contextvars.ContextVar("auth_lookup_on", default=False)
_group_lookup_on: contextvars.ContextVar[bool] = contextvars.ContextVar("group_lookup_on", default=False)

# `SET LOCAL` não aceita bind parameters, o que forçava interpolar o UUID na string SQL.
# `set_config(name, value, is_local=true)` é equivalente e aceita bind — o UUID nunca
# entra no texto da query.
_SET_RLS_USER = text("SELECT set_config('app.current_user_id', :uid, true)")

# A porta nomeada para as consultas que *estabelecem* identidade e por isso
# rodam antes de existir identidade — ver a migration 0025.
_SET_AUTH_LOOKUP = text("SELECT set_config('app.auth_lookup', :estado, true)")

# A porta para ler um grupo sem ser membro dele. São três casos, todos legítimos
# e todos fora de uma sessão de membro — ver a migration 0028.
_SET_GROUP_LOOKUP = text("SELECT set_config('app.group_lookup', :estado, true)")


def get_rls_user_id() -> str:
    """Return the current user ID for RLS (empty string if unauthenticated)."""
    return _current_user_id.get()


def set_rls_user_id(user_id: str) -> None:
    """Popula o contexto RLS depois que o middleware já passou.

    Existe para o Bearer. O middleware consegue resolver o cookie sozinho porque
    decodificar um JWT é operação pura; um token opaco exige ir ao banco, e ali
    ainda não há sessão. Então quem resolve o Bearer é a dependência — que já
    tem sessão — e avisa aqui.

    O `reset` continua sendo do middleware, no `finally` do dispatch.
    """
    _current_user_id.set(user_id)


async def apply_rls_user(session: AsyncSession, user_id: str | uuid.UUID) -> None:
    """Aplica o contexto RLS na transação atual da sessão.

    Requer uma transação ativa (`SET LOCAL`/`set_config(..., true)` são
    escopados à transação). Levanta ValueError se user_id não for um UUID válido.
    """
    uid = str(uuid.UUID(str(user_id)))
    await session.execute(_SET_RLS_USER, {"uid": uid})


def reapply_context_on_new_transaction(_session: object, _transaction: object, connection: Connection) -> None:
    """Re-aplica o contexto RLS toda vez que a sessão abre uma transação nova.

    `set_config(..., is_local := true)` morre no commit, e há caminho de request
    que commita no meio: `register_user` grava o usuário e commita, e o
    `log_event` seguinte já cai numa transação nova. Sem este gancho, tudo
    depois do primeiro commit roda **sem** `app.current_user_id` — o que hoje
    ninguém percebe porque o papel do banco é superusuário e ignora RLS, e que
    sob um papel comum vira erro de política no meio da requisição. Foi assim
    que apareceu: o INSERT no `audit_log` do registro passou a ser recusado.

    Preso ao evento `after_begin`, que é o único ponto que enxerga *toda*
    transação da sessão, inclusive as que ninguém pediu explicitamente.

    `app.current_user_id` só é escrito quando há valor: as políticas fazem
    `current_setting(...)::uuid`, e string vazia não converte para uuid — seria
    trocar "não casa nenhuma linha" por erro de query.
    """
    uid = _current_user_id.get()
    if uid:
        connection.execute(_SET_RLS_USER, {"uid": uid})
    if _auth_lookup_on.get():
        connection.execute(_SET_AUTH_LOOKUP, {"estado": "on"})
    if _group_lookup_on.get():
        connection.execute(_SET_GROUP_LOOKUP, {"estado": "on"})


def mark_auth_lookup() -> contextvars.Token[bool]:
    """Marca a requisição como caminho de autenticação, sem tocar no banco.

    De propósito não emite SQL: quem aplica é
    :func:`reapply_context_on_new_transaction`, quando (e se) uma transação
    começar. Abrir conexão aqui faria toda requisição sob `/auth` pagar uma
    conexão do pool mesmo quando ela vai morrer em 422 de validação, antes de
    qualquer query — que é exatamente o que acontecia.

    Devolve o token do ContextVar para quem chamou desfazer no fim.
    """
    return _auth_lookup_on.set(True)


def reset_auth_lookup(token: contextvars.Token[bool]) -> None:
    """Desfaz :func:`mark_auth_lookup`."""
    _auth_lookup_on.reset(token)


async def enable_auth_lookup(session: AsyncSession) -> None:
    """Abre a porta das consultas que estabelecem identidade.

    Sem ela, sob um papel de banco comum, `authenticate_user` procura o e-mail
    num `users` que a política manda não devolver — e o login responde
    "credenciais inválidas" para todo mundo, inclusive para quem acertou a
    senha. As políticas da 0025 é que consultam esta chave.

    Deixe ligada pelo menor tempo possível: enquanto vale, `users` é legível
    inteiro dentro da transação. Para uso pontual prefira :func:`auth_lookup`,
    que desliga sozinha.
    """
    _auth_lookup_on.set(True)
    await session.execute(_SET_AUTH_LOOKUP, {"estado": "on"})


async def disable_auth_lookup(session: AsyncSession) -> None:
    """Fecha a porta aberta por :func:`enable_auth_lookup`."""
    _auth_lookup_on.set(False)
    await session.execute(_SET_AUTH_LOOKUP, {"estado": "off"})


@asynccontextmanager
async def auth_lookup(session: AsyncSession) -> AsyncIterator[None]:
    """A porta aberta só pelo bloco, e fechada mesmo se ele levantar.

    É a forma preferida em rota que não é de autenticação — o Bearer resolve em
    qualquer rota, e o resto da requisição não tem por que seguir com `users`
    legível inteiro.
    """
    await enable_auth_lookup(session)
    try:
        yield
    except Exception:
        # Sem `finally`: se o bloco levantou por erro de banco, a transação está
        # abortada e *qualquer* comando nela levanta de novo — inclusive o
        # `set_config` de desligar. Isso trocaria a exceção real por um
        # "current transaction is aborted" e esconderia a causa. A transação vai
        # ser descartada de todo jeito; o que ainda precisa voltar ao lugar é o
        # ContextVar, que sobrevive à requisição.
        _auth_lookup_on.set(False)
        raise
    else:
        await disable_auth_lookup(session)


@asynccontextmanager
async def group_lookup(session: AsyncSession) -> AsyncIterator[None]:
    """Permite ler um grupo sem ser membro dele, pelo tempo do bloco.

    Antes da 0028 isto não era necessário porque `groups_select` liberava
    **qualquer grupo ativo para qualquer usuário autenticado** — inclusive o
    `invite_code`, já que RLS filtra linha e não coluna. Nenhum endpoint expõe
    isso hoje, mas era a única tabela em que RLS não somava nada.

    Fechada a política, sobraram três leituras legítimas de grupo fora de uma
    sessão de membro. Cada uma abre esta porta explicitamente, e é assim que se
    vê, lendo o código, quem lê grupo sem participar dele.

    Mesma disciplina de :func:`auth_lookup`: não usa `finally`, para não trocar
    um erro de banco real pelo "current transaction is aborted" do comando de
    saída.
    """
    _group_lookup_on.set(True)
    await session.execute(_SET_GROUP_LOOKUP, {"estado": "on"})
    try:
        yield
    except Exception:
        _group_lookup_on.set(False)
        raise
    else:
        _group_lookup_on.set(False)
        await session.execute(_SET_GROUP_LOOKUP, {"estado": "off"})


class RLSMiddleware(BaseHTTPMiddleware):
    """Extract user ID from the access_token cookie and store it in a ContextVar.

    The DB session dependency reads this value and calls :func:`apply_rls_user`,
    which sets ``app.current_user_id`` for the transaction so PostgreSQL RLS
    policies can reference ``current_setting('app.current_user_id', true)``.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        user_id = ""
        token = request.cookies.get(ACCESS_TOKEN_COOKIE)
        if token:
            user_id = extract_access_token_sub(token) or ""
        tok = _current_user_id.set(user_id)
        try:
            response = await call_next(request)
        finally:
            _current_user_id.reset(tok)
        return response
