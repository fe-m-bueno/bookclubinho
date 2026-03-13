"""Helpers de cookies httpOnly para autenticação — usados em auth e onboarding."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from fastapi import Response

COOKIE_KWARGS = {
    "httponly": True,
    "secure": not settings.DEBUG,
    "samesite": "lax",
    "path": "/",
}


ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
_COOKIE_NAMES = (ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Seta os cookies httpOnly de autenticação na resposta."""
    response.set_cookie(_COOKIE_NAMES[0], access_token, **COOKIE_KWARGS)
    response.set_cookie(_COOKIE_NAMES[1], refresh_token, **COOKIE_KWARGS)


def clear_auth_cookies(response: Response) -> None:
    """Remove os cookies de autenticação da resposta."""
    for name in _COOKIE_NAMES:
        response.delete_cookie(name, path="/")
