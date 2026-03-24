"""Request body size limit middleware — rejeita requisições muito grandes antes de ler o body."""

from __future__ import annotations

from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

# Limite padrão: 1 MB
_DEFAULT_LIMIT_BYTES = 1 * 1024 * 1024  # 1 MB

# Prefixos de rota com limite maior (uploads de mídia)
_UPLOAD_PATH_PREFIXES: tuple[str, ...] = (
    "/api/v1/groups",  # cobre /groups/{id}/media/upload
    "/api/v1/users/me/avatar",
)
_UPLOAD_LIMIT_BYTES = 16 * 1024 * 1024  # 16 MB (margem acima do limite de 10 MB da validação)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejeita requisições cujo Content-Length exceda o limite configurado.

    Para rotas de upload, o limite é de 16 MB.
    Para todas as outras rotas, o limite é de 1 MB.

    Verifica o header Content-Length antes de ler o body completo — prevenindo
    DoS por payloads gigantes e ataques slow-loris via body.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        limit = (
            _UPLOAD_LIMIT_BYTES
            if any(path.startswith(prefix) for prefix in _UPLOAD_PATH_PREFIXES)
            else _DEFAULT_LIMIT_BYTES
        )

        # Checar Content-Length se presente
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                size = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Requisição inválida."},
                )
            if size > limit:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Requisição muito grande."},
                )

        return await call_next(request)
