"""Tests for RLS middleware and context variable."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.rls import RLSMiddleware, _current_user_id, apply_rls_user, get_rls_user_id


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


class TestApplyRlsUser:
    """O UUID deve chegar ao Postgres como bind parameter, nunca interpolado no SQL."""

    @pytest.mark.asyncio
    async def test_passes_uuid_as_bind_parameter(self) -> None:
        session = AsyncMock()
        uid = "3f2b1c4e-5d6a-4b8c-9e0f-1a2b3c4d5e6f"

        await apply_rls_user(session, uid)

        session.execute.assert_awaited_once()
        stmt, params = session.execute.await_args.args
        assert params == {"uid": uid}
        assert uid not in str(stmt), "UUID foi interpolado no texto da query"

    @pytest.mark.asyncio
    async def test_uses_set_config_scoped_to_transaction(self) -> None:
        session = AsyncMock()

        await apply_rls_user(session, "3f2b1c4e-5d6a-4b8c-9e0f-1a2b3c4d5e6f")

        sql = str(session.execute.await_args.args[0])
        assert "set_config" in sql
        assert "app.current_user_id" in sql
        # terceiro argumento `true` == is_local, equivalente a SET LOCAL
        assert "true" in sql

    @pytest.mark.asyncio
    async def test_accepts_uuid_instance(self) -> None:
        session = AsyncMock()
        uid = uuid.uuid4()

        await apply_rls_user(session, uid)

        assert session.execute.await_args.args[1] == {"uid": str(uid)}

    @pytest.mark.asyncio
    async def test_rejects_non_uuid(self) -> None:
        session = AsyncMock()

        with pytest.raises(ValueError):
            await apply_rls_user(session, "'; DROP TABLE users; --")

        session.execute.assert_not_awaited()
