from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from tests.conftest import make_user, mock_db_returning

# ── get_session RLS tests ────────────────────────────────────────────────────


class TestGetSessionRLS:
    @pytest.mark.asyncio
    async def test_sets_rls_user_id_with_literal(self) -> None:
        """SET LOCAL must use a literal UUID, not a bind parameter."""
        from app.core.deps import get_session

        user_id = str(uuid.uuid4())
        mock_session = AsyncMock()

        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_cm),
            patch("app.core.deps.get_rls_user_id", return_value=user_id),
        ):
            gen = get_session()
            session = await gen.__anext__()
            assert session is mock_session

            # Verify SET LOCAL was called with a literal UUID (no bind params)
            mock_session.execute.assert_called_once()
            call_args = mock_session.execute.call_args
            sql_clause = call_args[0][0]
            assert f"'{user_id}'" in sql_clause.text
            assert ":uid" not in sql_clause.text

    @pytest.mark.asyncio
    async def test_skips_set_local_when_no_user(self) -> None:
        """No SET LOCAL when user_id is empty (unauthenticated)."""
        from app.core.deps import get_session

        mock_session = AsyncMock()

        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_cm),
            patch("app.core.deps.get_rls_user_id", return_value=""),
        ):
            gen = get_session()
            await gen.__anext__()

            mock_session.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_rejects_non_uuid_user_id(self) -> None:
        """Non-UUID user_id must raise ValueError (prevents SQL injection)."""
        from app.core.deps import get_session

        mock_session = AsyncMock()

        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cm.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_cm),
            patch("app.core.deps.get_rls_user_id", return_value="'; DROP TABLE users; --"),
        ):
            gen = get_session()
            with pytest.raises(ValueError):
                await gen.__anext__()


# ── get_current_user tests ───────────────────────────────────────────────────


class TestGetSession:
    """Tests for the get_session dependency — especially RLS SET LOCAL."""

    @pytest.mark.asyncio
    async def test_set_local_uses_literal_not_bind_param(self) -> None:
        """Regression: SET LOCAL does not support bind params ($1/:uid).

        The user_id must be interpolated as a literal string after UUID validation.
        """
        from app.core.deps import get_session

        uid = str(uuid.uuid4())
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_ctx),
            patch("app.core.deps.get_rls_user_id", return_value=uid),
        ):
            gen = get_session()
            session = await gen.__anext__()
            assert session is mock_session

            # Verify SET LOCAL was called with a literal, not a bind param
            call_args = mock_session.execute.call_args
            sql_text = str(call_args[0][0].text)
            assert f"'{uid}'" in sql_text
            assert ":uid" not in sql_text
            assert "$1" not in sql_text

            # Clean up generator
            try:
                await gen.__anext__()
            except StopAsyncIteration:
                pass

    @pytest.mark.asyncio
    async def test_set_local_rejects_non_uuid(self) -> None:
        """SET LOCAL must reject non-UUID values to prevent SQL injection."""
        from app.core.deps import get_session

        mock_session = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_ctx),
            patch("app.core.deps.get_rls_user_id", return_value="'; DROP TABLE users; --"),
        ):
            gen = get_session()
            with pytest.raises(ValueError):
                await gen.__anext__()

    @pytest.mark.asyncio
    async def test_no_set_local_when_unauthenticated(self) -> None:
        """When no user is authenticated, SET LOCAL should not be called."""
        from app.core.deps import get_session

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()
        mock_session.commit = AsyncMock()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.core.deps.AsyncSessionLocal", return_value=mock_ctx),
            patch("app.core.deps.get_rls_user_id", return_value=""),
        ):
            gen = get_session()
            await gen.__anext__()
            mock_session.execute.assert_not_called()
            try:
                await gen.__anext__()
            except StopAsyncIteration:
                pass


class TestGetCurrentUser:
    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self) -> None:
        from app.core.deps import get_current_user

        user = make_user()
        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(user)

        with patch("app.core.deps.extract_access_token_sub", return_value=str(user.id)):
            result = await get_current_user(request, db, access_token="valid.token.here")

        assert result is user

    @pytest.mark.asyncio
    async def test_cache_hit_skips_db(self) -> None:
        from app.core.deps import get_current_user

        user = make_user()
        request = MagicMock()
        request.state._resolved_user = user
        db = mock_db_returning(None)

        result = await get_current_user(request, db, access_token="any.token")

        db.execute.assert_not_called()
        assert result is user

    @pytest.mark.asyncio
    async def test_missing_cookie_raises_401(self) -> None:
        from app.core.deps import get_current_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request, db, access_token=None)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_jwt_raises_401(self) -> None:
        from app.core.deps import get_current_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with (
            patch("app.core.deps.extract_access_token_sub", return_value=None),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user(request, db, access_token="bad.token")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_token_type_raises_401(self) -> None:
        from app.core.deps import get_current_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with (
            patch("app.core.deps.extract_access_token_sub", return_value=None),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user(request, db, access_token="refresh.token")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_user_not_found_raises_401(self) -> None:
        from app.core.deps import get_current_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with (
            patch("app.core.deps.extract_access_token_sub", return_value=str(uuid.uuid4())),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user(request, db, access_token="valid.token")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_caches_user_in_request_state(self) -> None:
        from app.core.deps import get_current_user

        user = make_user()
        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(user)

        with patch("app.core.deps.extract_access_token_sub", return_value=str(user.id)):
            await get_current_user(request, db, access_token="valid.token")

        assert request.state._resolved_user is user


class TestGetCurrentActiveUser:
    @pytest.mark.asyncio
    async def test_active_user_passes(self) -> None:
        from app.core.deps import get_current_active_user

        user = make_user(is_active=True)
        result = await get_current_active_user(user)
        assert result is user

    @pytest.mark.asyncio
    async def test_inactive_user_raises_403(self) -> None:
        from app.core.deps import get_current_active_user

        user = make_user(is_active=False)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_active_user(user)

        assert exc_info.value.status_code == 403


class TestGetOptionalUser:
    @pytest.mark.asyncio
    async def test_missing_cookie_returns_none(self) -> None:
        from app.core.deps import get_optional_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        result = await get_optional_user(request, db, access_token=None)
        assert result is None

    @pytest.mark.asyncio
    async def test_invalid_token_returns_none(self) -> None:
        from app.core.deps import get_optional_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with patch("app.core.deps.extract_access_token_sub", return_value=None):
            result = await get_optional_user(request, db, access_token="bad.token")

        assert result is None

    @pytest.mark.asyncio
    async def test_wrong_type_returns_none(self) -> None:
        from app.core.deps import get_optional_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with patch("app.core.deps.extract_access_token_sub", return_value=None):
            result = await get_optional_user(request, db, access_token="refresh.token")

        assert result is None

    @pytest.mark.asyncio
    async def test_user_not_found_returns_none(self) -> None:
        from app.core.deps import get_optional_user

        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(None)

        with patch("app.core.deps.extract_access_token_sub", return_value=str(uuid.uuid4())):
            result = await get_optional_user(request, db, access_token="valid.token")

        assert result is None

    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self) -> None:
        from app.core.deps import get_optional_user

        user = make_user()
        request = MagicMock()
        request.state = MagicMock(spec=[])
        db = mock_db_returning(user)

        with patch("app.core.deps.extract_access_token_sub", return_value=str(user.id)):
            result = await get_optional_user(request, db, access_token="valid.token")

        assert result is user

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_user(self) -> None:
        from app.core.deps import get_optional_user

        user = make_user()
        request = MagicMock()
        request.state._resolved_user = user
        db = mock_db_returning(None)

        result = await get_optional_user(request, db, access_token="any.token")

        db.execute.assert_not_called()
        assert result is user
