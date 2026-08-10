"""Row-Level Security middleware — injects current_user_id into every DB transaction."""

from __future__ import annotations

import contextvars
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.cookies import ACCESS_TOKEN_COOKIE
from app.core.security import extract_access_token_sub

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from starlette.requests import Request
    from starlette.responses import Response

_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("current_user_id", default="")

# `SET LOCAL` não aceita bind parameters, o que forçava interpolar o UUID na string SQL.
# `set_config(name, value, is_local=true)` é equivalente e aceita bind — o UUID nunca
# entra no texto da query.
_SET_RLS_USER = text("SELECT set_config('app.current_user_id', :uid, true)")


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
