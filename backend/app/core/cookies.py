"""Helpers de cookies httpOnly para autenticação — usados em auth e onboarding."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from fastapi import Response

_COMMON_KWARGS = {
    "httponly": True,
    "secure": not settings.DEBUG,
    "samesite": "lax",
    "path": "/",
}

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
_COOKIE_NAMES = (ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Seta os cookies httpOnly de autenticação na resposta com max_age correto."""
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_COMMON_KWARGS,
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE,
        refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86_400,
        **_COMMON_KWARGS,
    )


def clear_auth_cookies(response: Response) -> None:
    """Remove os cookies de autenticação da resposta."""
    for name in _COOKIE_NAMES:
        response.delete_cookie(name, path="/")
