"""A isenção de CSRF para clientes que se autenticam por Bearer.

CSRF existe porque o browser anexa cookie sozinho. Quem manda `Authorization`
não tem esse problema — mas a isenção só pode valer quando *não* há cookie de
sessão junto, senão ela vira o próprio buraco que o middleware fecha.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.core.cookies import ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE
from app.security.csrf import _CSRF_COOKIE, _CSRF_HEADER, CSRFMiddleware


def _request(cookies: dict[str, str], headers: dict[str, str]) -> MagicMock:
    request = MagicMock()
    request.method = "POST"
    request.url.path = "/api/v1/groups"
    request.cookies = cookies
    request.headers = headers
    return request


async def _dispatch(request: MagicMock) -> MagicMock:
    middleware = CSRFMiddleware(app=MagicMock())
    passed_through = MagicMock()
    passed_through.status_code = 200

    async def call_next(_req: object) -> MagicMock:
        return passed_through

    return await middleware.dispatch(request, call_next)


class TestBearerExemption:
    @pytest.mark.asyncio
    async def test_bearer_without_cookies_skips_csrf(self) -> None:
        result = await _dispatch(_request({}, {"authorization": "Bearer bcp_qualquer"}))
        assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_scheme_match_is_case_insensitive(self) -> None:
        result = await _dispatch(_request({}, {"authorization": "bearer bcp_qualquer"}))
        assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_bearer_alongside_access_cookie_still_requires_csrf(self) -> None:
        """O caso que importa.

        Sem o `and not cookie`, bastaria um `Authorization` inventado — que nem
        precisa ser válido, este middleware não valida nada — para desligar o
        CSRF de uma requisição que segue autenticada pelo cookie que o browser
        anexou sozinho.
        """
        result = await _dispatch(
            _request(
                {ACCESS_TOKEN_COOKIE: "jwt-da-sessao"},
                {"authorization": "Bearer lixo-inventado"},
            )
        )
        assert result.status_code == 403

    @pytest.mark.asyncio
    async def test_bearer_alongside_refresh_cookie_still_requires_csrf(self) -> None:
        result = await _dispatch(
            _request(
                {REFRESH_TOKEN_COOKIE: "refresh-da-sessao"},
                {"authorization": "Bearer lixo-inventado"},
            )
        )
        assert result.status_code == 403

    @pytest.mark.asyncio
    async def test_cookie_session_with_valid_csrf_still_passes(self) -> None:
        """A isenção não pode ter quebrado o caminho normal do browser."""
        result = await _dispatch(
            _request(
                {ACCESS_TOKEN_COOKIE: "jwt", _CSRF_COOKIE: "mesmo-valor"},
                {_CSRF_HEADER: "mesmo-valor"},
            )
        )
        assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_other_auth_schemes_do_not_exempt(self) -> None:
        result = await _dispatch(_request({}, {"authorization": "Basic dXNlcjpwYXNz"}))
        assert result.status_code == 403

    @pytest.mark.asyncio
    async def test_no_credentials_at_all_still_requires_csrf(self) -> None:
        result = await _dispatch(_request({}, {}))
        assert result.status_code == 403
