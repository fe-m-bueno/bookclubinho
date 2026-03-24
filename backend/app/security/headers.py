"""Security headers middleware — adicionado a toda resposta da API."""

from __future__ import annotations

from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.config import settings

# Rotas de API autenticadas que devem receber Cache-Control: no-store
_AUTH_PATH_PREFIXES = ("/api/v1/users", "/api/v1/groups", "/api/v1/rounds", "/api/v1/auth/sessions")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injeta security headers em todas as respostas HTTP.

    Headers aplicados:
    - X-Content-Type-Options: nosniff (previne MIME sniffing)
    - X-Frame-Options: DENY (previne clickjacking)
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: desabilita APIs de browser desnecessárias
    - Strict-Transport-Security: apenas em produção (HTTPS enforced)
    - Cache-Control: no-store em rotas autenticadas sensíveis
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        # X-XSS-Protection desabilitado intencionalmente — CSP é a proteção correta
        response.headers["X-XSS-Protection"] = "0"

        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Cache-Control: no-store em rotas autenticadas (dados sensíveis)
        path = request.url.path
        if any(path.startswith(prefix) for prefix in _AUTH_PATH_PREFIXES):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate")

        return response
