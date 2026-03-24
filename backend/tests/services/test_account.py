"""Testes de serviço para account (change_password, email change)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.account import AccountError, change_password, initiate_email_change
from tests.conftest import mock_db_returning


def _make_local_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email = overrides.get("email", "user@test.com")
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.auth_provider = overrides.get("auth_provider", "local")
    user.hashed_password = overrides.get("hashed_password", "$2b$12$fakehash")
    return user


# ── change_password ───────────────────────────────────────────────────────────


class TestChangePassword:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        user = _make_local_user()
        db = mock_db_returning(None)

        with (
            patch("app.services.account.verify_password", side_effect=[True, False]) as mock_vp,
            patch("app.services.account.hash_password", return_value="$2b$12$newhash") as mock_hp,
        ):
            await change_password(
                db=db,
                user=user,
                current_password="oldpass",
                new_password="newpassword1",
            )

        assert user.hashed_password == "$2b$12$newhash"

    @pytest.mark.asyncio
    async def test_wrong_current_password(self) -> None:
        user = _make_local_user()
        db = mock_db_returning(None)

        with patch("app.services.account.verify_password", return_value=False):
            with pytest.raises(AccountError, match="incorreta"):
                await change_password(
                    db=db,
                    user=user,
                    current_password="wrongpass",
                    new_password="newpassword1",
                )

    @pytest.mark.asyncio
    async def test_non_local_raises_403(self) -> None:
        user = _make_local_user(auth_provider="google")
        db = mock_db_returning(None)

        with pytest.raises(AccountError) as exc_info:
            await change_password(
                db=db,
                user=user,
                current_password="x",
                new_password="newpassword1",
            )

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_too_short_raises(self) -> None:
        user = _make_local_user()
        db = mock_db_returning(None)

        with patch("app.services.account.verify_password", return_value=True):
            with pytest.raises(AccountError, match="8 caracteres"):
                await change_password(
                    db=db,
                    user=user,
                    current_password="oldpass",
                    new_password="short",
                )

    @pytest.mark.asyncio
    async def test_same_password_raises(self) -> None:
        user = _make_local_user()
        db = mock_db_returning(None)

        # First call: verify current = True; second call: verify new == current = True
        with patch("app.services.account.verify_password", side_effect=[True, True]):
            with pytest.raises(AccountError, match="diferente"):
                await change_password(
                    db=db,
                    user=user,
                    current_password="samepass1234",
                    new_password="samepass1234",
                )


# ── initiate_email_change ─────────────────────────────────────────────────────


class TestInitiateEmailChange:
    @pytest.mark.asyncio
    async def test_success_sends_email(self) -> None:
        user = _make_local_user(email="old@test.com")
        db = mock_db_returning(None)  # new email not in use

        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)  # rate limit = 0
        redis.set = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.expire = MagicMock()
        pipe.execute = AsyncMock(return_value=[1, True])
        redis.pipeline = MagicMock(return_value=pipe)

        with (
            patch("app.services.account.verify_password", return_value=True),
            patch("app.services.account.send_email_change_email") as mock_email,
            patch("app.services.account.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_thread.side_effect = lambda fn, *args: fn(*args)
            await initiate_email_change(
                redis=redis,
                db=db,
                user=user,
                new_email="new@test.com",
                current_password="correct",
            )

        redis.set.assert_called_once()
        call_args = redis.set.call_args
        assert "email_change:" in call_args[0][0]

    @pytest.mark.asyncio
    async def test_email_already_taken(self) -> None:
        user = _make_local_user(email="old@test.com")
        existing = MagicMock()
        db = mock_db_returning(existing)  # email in use

        redis = AsyncMock()

        with patch("app.services.account.verify_password", return_value=True):
            with pytest.raises(AccountError, match="já está em uso"):
                await initiate_email_change(
                    redis=redis,
                    db=db,
                    user=user,
                    new_email="taken@test.com",
                    current_password="correct",
                )

    @pytest.mark.asyncio
    async def test_same_email_raises(self) -> None:
        user = _make_local_user(email="same@test.com")
        db = mock_db_returning(None)
        redis = AsyncMock()

        with patch("app.services.account.verify_password", return_value=True):
            with pytest.raises(AccountError, match="diferente"):
                await initiate_email_change(
                    redis=redis,
                    db=db,
                    user=user,
                    new_email="SAME@test.com",
                    current_password="correct",
                )
