"""Tests for the CSRF double-submit cookie middleware."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.security.csrf import _CSRF_COOKIE, _CSRF_HEADER, CSRFMiddleware


class TestCSRFMiddleware:
    @pytest.mark.asyncio
    async def test_safe_methods_pass_through(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        for method in ("GET", "HEAD", "OPTIONS"):
            mock_request = MagicMock()
            mock_request.method = method
            mock_request.cookies = {}
            mock_request.headers = {}

            resp = MagicMock()

            async def call_next(req: object, _r: MagicMock = resp) -> MagicMock:
                return _r

            result = await middleware.dispatch(mock_request, call_next)
            assert result is resp

    @pytest.mark.asyncio
    async def test_exempt_paths_pass_through(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        exempt_paths = (
            "/api/v1/auth/register",
            "/api/v1/auth/login",
            "/api/v1/auth/verify-email",
            "/api/v1/auth/resend-verification",
            "/api/v1/auth/magic-link",
            "/api/v1/auth/google/callback",
            "/api/v1/auth/magic/callback",
        )
        for path in exempt_paths:
            mock_request = MagicMock()
            mock_request.method = "POST"
            mock_request.url.path = path
            mock_request.cookies = {}
            mock_request.headers = {}

            resp = MagicMock()

            async def call_next(req: object, _r: MagicMock = resp) -> MagicMock:
                return _r

            result = await middleware.dispatch(mock_request, call_next)
            assert result is resp

    @pytest.mark.asyncio
    async def test_missing_csrf_token_returns_403(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/groups"
        mock_request.cookies = {}
        mock_request.headers = {}

        async def call_next(req: object) -> MagicMock:
            return MagicMock()

        result = await middleware.dispatch(mock_request, call_next)
        assert result.status_code == 403

    @pytest.mark.asyncio
    async def test_mismatched_csrf_token_returns_403(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/groups"
        mock_request.cookies = {_CSRF_COOKIE: "token-a"}
        mock_request.headers = {_CSRF_HEADER: "token-b"}

        async def call_next(req: object) -> MagicMock:
            return MagicMock()

        result = await middleware.dispatch(mock_request, call_next)
        assert result.status_code == 403

    @pytest.mark.asyncio
    async def test_matching_csrf_token_passes(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        mock_request = MagicMock()
        mock_request.method = "POST"
        mock_request.url.path = "/api/v1/groups"
        mock_request.cookies = {_CSRF_COOKIE: "valid-token-xyz"}
        mock_request.headers = {_CSRF_HEADER: "valid-token-xyz"}

        response = MagicMock()

        async def call_next(req: object) -> MagicMock:
            return response

        result = await middleware.dispatch(mock_request, call_next)
        assert result is response

    @pytest.mark.asyncio
    async def test_csrf_cookie_set_on_get_response(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.cookies = {}  # no csrf cookie yet

        response = MagicMock()

        async def call_next(req: object) -> MagicMock:
            return response

        await middleware.dispatch(mock_request, call_next)

        response.set_cookie.assert_called_once()
        cookie_kwargs = response.set_cookie.call_args
        assert cookie_kwargs[1]["httponly"] is False  # JS must read it
        cookie_name = (
            cookie_kwargs[0][0] if cookie_kwargs[0] else cookie_kwargs[1].get("key", "")
        )
        assert _CSRF_COOKIE in cookie_name

    @pytest.mark.asyncio
    async def test_csrf_cookie_not_reset_if_exists(self) -> None:
        middleware = CSRFMiddleware(app=MagicMock())

        mock_request = MagicMock()
        mock_request.method = "GET"
        mock_request.cookies = {_CSRF_COOKIE: "existing-token"}

        response = MagicMock()

        async def call_next(req: object) -> MagicMock:
            return response

        await middleware.dispatch(mock_request, call_next)

        response.set_cookie.assert_not_called()


class TestTokenHashing:
    """Test that auth service uses hashed tokens in Redis."""

    def test_hash_token_is_hmac_sha256(self) -> None:
        import hmac as _hmac

        from app.core.config import settings
        from app.services.auth import _hash_token

        token = "my-secret-token"
        expected = _hmac.new(settings.JWT_SECRET.encode(), token.encode(), "sha256").hexdigest()
        assert _hash_token(token) == expected

    def test_hash_token_deterministic(self) -> None:
        from app.services.auth import _hash_token

        assert _hash_token("abc") == _hash_token("abc")

    def test_different_tokens_different_hashes(self) -> None:
        from app.services.auth import _hash_token

        assert _hash_token("token-a") != _hash_token("token-b")
