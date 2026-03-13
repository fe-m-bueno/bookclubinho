from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.db.models.user import User
from tests.conftest import make_user, mock_db_returning


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
