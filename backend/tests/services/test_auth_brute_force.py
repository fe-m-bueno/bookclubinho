"""Testes para brute force protection em authenticate_user."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.auth import (
    AuthError,
    _hash_email,
    _increment_login_fail,
    _is_login_locked,
    _lock_account,
    _reset_login_fail,
    authenticate_user,
)
from tests.conftest import make_user

# ── _hash_email ────────────────────────────────────────────────────────────────


class TestHashEmail:
    def test_returns_64_char_hex(self) -> None:
        result = _hash_email("user@example.com")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_case_insensitive_same_hash(self) -> None:
        assert _hash_email("User@Example.COM") == _hash_email("user@example.com")

    def test_different_emails_different_hashes(self) -> None:
        assert _hash_email("a@b.com") != _hash_email("c@d.com")


# ── Redis helpers ─────────────────────────────────────────────────────────────


class TestBruteForceHelpers:
    @pytest.mark.asyncio
    async def test_increment_login_fail_sets_ttl_on_first(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock()

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            count = await _increment_login_fail("abc123")

        assert count == 1
        mock_redis.expire.assert_called_once()

    @pytest.mark.asyncio
    async def test_increment_login_fail_no_expire_after_first(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=5)
        mock_redis.expire = AsyncMock()

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            count = await _increment_login_fail("abc123")

        assert count == 5
        mock_redis.expire.assert_not_called()

    @pytest.mark.asyncio
    async def test_reset_login_fail_deletes_key(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.delete = AsyncMock()

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            await _reset_login_fail("abc123")

        mock_redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_is_login_locked_returns_true_when_locked(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="1")

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            locked = await _is_login_locked("abc123")

        assert locked is True

    @pytest.mark.asyncio
    async def test_is_login_locked_returns_false_when_not_locked(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            locked = await _is_login_locked("abc123")

        assert locked is False

    @pytest.mark.asyncio
    async def test_lock_account_sets_key_with_ttl(self) -> None:
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()

        with patch("app.services.auth.get_redis", return_value=mock_redis):
            await _lock_account("abc123")

        mock_redis.set.assert_called_once()
        call_kwargs = mock_redis.set.call_args
        assert call_kwargs[1]["ex"] == 900  # _LOGIN_LOCK_TTL


# ── authenticate_user — brute force ─────────────────────────────────────────


def _make_redis(*, locked: bool = False, fail_count: int = 0) -> AsyncMock:
    mock_redis = AsyncMock()
    # is_login_locked check
    mock_redis.get = AsyncMock(return_value="1" if locked else None)
    # increment_login_fail
    mock_redis.incr = AsyncMock(return_value=fail_count + 1)
    mock_redis.expire = AsyncMock()
    mock_redis.delete = AsyncMock()
    mock_redis.set = AsyncMock()
    return mock_redis


def _make_user(*, email_verified: bool = True, is_active: bool = True) -> MagicMock:
    user = make_user(is_active=is_active)
    user.email_verified = email_verified  # make_user doesn't set this — must be explicit
    user.email = "user@example.com"
    user.hashed_password = "$2b$12$" + "X" * 53
    return user


class TestAuthenticateUserBruteForce:
    @pytest.mark.asyncio
    async def test_locked_account_raises_generic_error(self) -> None:
        mock_redis = _make_redis(locked=True)
        db = AsyncMock()

        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=False),
        ):
            with pytest.raises(AuthError) as exc_info:
                await authenticate_user(db=db, email="user@example.com", password="wrong")

        assert "Credenciais inválidas" in str(exc_info.value)
        assert exc_info.value.status_code == 401
        # DB should NOT be queried when locked
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_wrong_password_increments_counter(self) -> None:
        mock_redis = _make_redis(locked=False, fail_count=0)
        user = _make_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = user
        db.execute = AsyncMock(return_value=result)

        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=False),
            pytest.raises(AuthError),
        ):
            await authenticate_user(db=db, email="user@example.com", password="wrong")

        mock_redis.incr.assert_called_once()

    @pytest.mark.asyncio
    async def test_successful_login_resets_counter(self) -> None:
        mock_redis = _make_redis(locked=False)
        user = _make_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = user
        db.execute = AsyncMock(return_value=result)
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=True),
            patch("app.services.auth.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.auth._create_session", new=AsyncMock()),
        ):
            await authenticate_user(db=db, email="user@example.com", password="correct")

        # delete() called to reset counter
        mock_redis.delete.assert_called()

    @pytest.mark.asyncio
    async def test_lockout_triggered_at_ten_failures(self) -> None:
        # fail_count=9 means incr returns 10 (= _LOGIN_MAX_FAILS)
        mock_redis = _make_redis(locked=False, fail_count=9)
        user = _make_user()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = user
        db.execute = AsyncMock(return_value=result)

        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=False),
            patch("app.services.auth.asyncio.create_task"),
            pytest.raises(AuthError),
        ):
            await authenticate_user(db=db, email="user@example.com", password="wrong")

        # Lock key should be set
        mock_redis.set.assert_called()
        lock_call = mock_redis.set.call_args
        assert "login_lock:" in lock_call[0][0]

    @pytest.mark.asyncio
    async def test_unverified_email_returns_generic_401(self) -> None:
        """Unverified email must return 401 with the same generic message (anti-enumeration)."""
        mock_redis = _make_redis(locked=False, fail_count=0)
        user = _make_user(email_verified=False)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = user
        db.execute = AsyncMock(return_value=result)

        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=True),
        ):
            with pytest.raises(AuthError) as exc_info:
                await authenticate_user(db=db, email="user@example.com", password="correct")

        # Must be 401 (NOT 403) with generic message
        assert exc_info.value.status_code == 401
        assert "Credenciais inválidas" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_progressive_delay_applied_on_failure(self) -> None:
        """4th failure triggers 2s delay."""
        mock_redis = _make_redis(locked=False, fail_count=3)
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)

        sleep_mock = AsyncMock()
        with (
            patch("app.services.auth.get_redis", return_value=mock_redis),
            patch("app.services.auth.verify_password", return_value=False),
            patch("app.services.auth.asyncio.sleep", sleep_mock),
            pytest.raises(AuthError),
        ):
            await authenticate_user(db=db, email="user@example.com", password="wrong")

        sleep_mock.assert_called_once_with(2.0)


# ── Cookie max_age ────────────────────────────────────────────────────────────


class TestCookieMaxAge:
    def test_set_auth_cookies_includes_max_age(self) -> None:
        from unittest.mock import MagicMock

        from app.core.config import settings
        from app.core.cookies import set_auth_cookies

        response = MagicMock()
        set_auth_cookies(response, "access_tok", "refresh_tok")

        calls = response.set_cookie.call_args_list
        assert len(calls) == 2

        # Access token
        access_call = calls[0]
        assert access_call[1]["max_age"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        # Refresh token
        refresh_call = calls[1]
        assert refresh_call[1]["max_age"] == settings.REFRESH_TOKEN_EXPIRE_DAYS * 86_400
