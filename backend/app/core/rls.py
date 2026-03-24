"""Row-Level Security middleware — injects current_user_id into every DB transaction."""

from __future__ import annotations

import contextvars
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.cookies import ACCESS_TOKEN_COOKIE
from app.core.security import extract_access_token_sub

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response

_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("current_user_id", default="")


def get_rls_user_id() -> str:
    """Return the current user ID for RLS (empty string if unauthenticated)."""
    return _current_user_id.get()


class RLSMiddleware(BaseHTTPMiddleware):
    """Extract user ID from the access_token cookie and store it in a ContextVar.

    The DB session dependency reads this value and executes
    ``SET LOCAL app.current_user_id = '<uuid>'`` so PostgreSQL RLS
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
