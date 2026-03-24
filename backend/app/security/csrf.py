"""CSRF double-submit cookie middleware.

Every response carries a non-httpOnly ``csrf_token`` cookie.  Mutating
requests (POST / PUT / PATCH / DELETE) must echo the cookie value back in
an ``X-CSRF-Token`` header.  Comparison uses ``hmac.compare_digest`` to
prevent timing attacks.
"""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.security import safe_compare

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.responses import Response

_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Paths exempt from CSRF validation:
# - Auth endpoints where the client doesn't yet have a CSRF cookie
# - OAuth/magic-link callbacks that are redirect-based
_EXEMPT_PATHS = frozenset(
    {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/magic-link",
        "/api/v1/auth/google/callback",
        "/api/v1/auth/magic/callback",
    }
)

_CSRF_COOKIE = "csrf_token"
_CSRF_HEADER = "x-csrf-token"
_TOKEN_BYTES = 32


class CSRFMiddleware(BaseHTTPMiddleware):
    """Enforce the double-submit cookie pattern on mutating requests."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _SAFE_METHODS:
            response = await call_next(request)
            _ensure_csrf_cookie(request, response)
            return response

        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        cookie_token = request.cookies.get(_CSRF_COOKIE)
        header_token = request.headers.get(_CSRF_HEADER)

        if not cookie_token or not header_token:
            return JSONResponse(status_code=403, content={"detail": "CSRF token ausente."})

        if not safe_compare(cookie_token, header_token):
            return JSONResponse(status_code=403, content={"detail": "CSRF token inválido."})

        response = await call_next(request)
        _ensure_csrf_cookie(request, response)
        return response


def _ensure_csrf_cookie(request: Request, response: Response) -> None:
    """Set the CSRF cookie if it is not already present."""
    if not request.cookies.get(_CSRF_COOKIE):
        token = secrets.token_urlsafe(_TOKEN_BYTES)
        response.set_cookie(
            _CSRF_COOKIE,
            token,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            httponly=False,
            secure=not settings.DEBUG,
            samesite="lax",
            path="/",
        )
