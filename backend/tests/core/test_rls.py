"""Tests for RLS middleware and context variable."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.core.rls import RLSMiddleware, _current_user_id, get_rls_user_id


class TestGetRlsUserId:
    def test_default_empty_string(self) -> None:
        # ContextVar default is ""
        assert get_rls_user_id() == ""

    def test_returns_set_value(self) -> None:
        tok = _current_user_id.set("user-123")
        try:
            assert get_rls_user_id() == "user-123"
        finally:
            _current_user_id.reset(tok)


class TestRLSMiddleware:
    @pytest.mark.asyncio
    async def test_sets_user_id_from_valid_jwt(self) -> None:
        middleware = RLSMiddleware(app=MagicMock())

        captured_user_id: str | None = None

        async def call_next(request: object) -> MagicMock:
            nonlocal captured_user_id
            captured_user_id = get_rls_user_id()
            return MagicMock()

        mock_request = MagicMock()
        mock_request.cookies = {"access_token": "valid.jwt.token"}

        with patch(
            "app.core.rls.extract_access_token_sub",
            return_value="user-abc-123",
        ):
            await middleware.dispatch(mock_request, call_next)

        assert captured_user_id == "user-abc-123"

    @pytest.mark.asyncio
    async def test_empty_string_when_no_cookie(self) -> None:
        middleware = RLSMiddleware(app=MagicMock())

        captured_user_id: str | None = None

        async def call_next(request: object) -> MagicMock:
            nonlocal captured_user_id
            captured_user_id = get_rls_user_id()
            return MagicMock()

        mock_request = MagicMock()
        mock_request.cookies = {}

        await middleware.dispatch(mock_request, call_next)

        assert captured_user_id == ""

    @pytest.mark.asyncio
    async def test_empty_string_on_invalid_jwt(self) -> None:
        middleware = RLSMiddleware(app=MagicMock())

        captured_user_id: str | None = None

        async def call_next(request: object) -> MagicMock:
            nonlocal captured_user_id
            captured_user_id = get_rls_user_id()
            return MagicMock()

        mock_request = MagicMock()
        mock_request.cookies = {"access_token": "invalid.token"}

        with patch("app.core.rls.extract_access_token_sub", return_value=None):
            await middleware.dispatch(mock_request, call_next)

        assert captured_user_id == ""

    @pytest.mark.asyncio
    async def test_resets_context_after_request(self) -> None:
        middleware = RLSMiddleware(app=MagicMock())

        async def call_next(request: object) -> MagicMock:
            return MagicMock()

        mock_request = MagicMock()
        mock_request.cookies = {"access_token": "valid.jwt"}

        with patch(
            "app.core.rls.extract_access_token_sub",
            return_value="user-xyz",
        ):
            await middleware.dispatch(mock_request, call_next)

        # After dispatch, context var should be back to default
        assert get_rls_user_id() == ""

    @pytest.mark.asyncio
    async def test_ignores_refresh_token_type(self) -> None:
        middleware = RLSMiddleware(app=MagicMock())

        captured_user_id: str | None = None

        async def call_next(request: object) -> MagicMock:
            nonlocal captured_user_id
            captured_user_id = get_rls_user_id()
            return MagicMock()

        mock_request = MagicMock()
        mock_request.cookies = {"access_token": "refresh.jwt"}

        with patch(
            "app.core.rls.extract_access_token_sub",
            return_value=None,
        ):
            await middleware.dispatch(mock_request, call_next)

        assert captured_user_id == ""
