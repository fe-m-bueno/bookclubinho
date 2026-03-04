"""Testes unitários para os endpoints e serviços de autenticação."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.auth import LoginResponse, RegisterRequest, RegisterResponse, VerifyEmailResponse
from app.services.auth import AuthError

# ── helpers ────────────────────────────────────────────────────────────────────


def _mock_db_returning(value: object) -> AsyncMock:
    """AsyncSession mock cujo execute() retorna um MagicMock com scalar_one_or_none = value.

    scalar_one_or_none é uma chamada SYNC no objeto retornado por await db.execute(),
    então usamos MagicMock (não AsyncMock) como return_value do execute.
    """
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ── Schema tests ───────────────────────────────────────────────────────────────


class TestRegisterRequest:
    def test_valid_payload(self) -> None:
        req = RegisterRequest(
            email="user@example.com",
            password="securepass",
            display_name="Felipe Bueno",
        )
        assert req.email == "user@example.com"
        assert req.display_name == "Felipe Bueno"

    def test_password_too_short(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="8 caracteres"):
            RegisterRequest(email="a@b.com", password="short", display_name="X")

    def test_empty_display_name(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="vazio"):
            RegisterRequest(email="a@b.com", password="securepass", display_name="   ")

    def test_invalid_email(self) -> None:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            RegisterRequest(email="not-an-email", password="securepass", display_name="X")

    def test_register_response(self) -> None:
        r = RegisterResponse(message="ok")
        assert r.message == "ok"

    def test_login_response(self) -> None:
        r = LoginResponse(message="done")
        assert r.message == "done"

    def test_verify_response(self) -> None:
        r = VerifyEmailResponse(message="verified")
        assert r.message == "verified"


# ── Service: register_user ─────────────────────────────────────────────────────


class TestRegisterUser:
    @pytest.mark.asyncio
    async def test_creates_user_and_sends_email(self) -> None:
        from app.services.auth import register_user

        mock_db = _mock_db_returning(None)  # no existing user

        user_id = uuid.uuid4()

        with (
            patch("app.services.auth.hash_password", return_value="hashed") as mock_hash,
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            with patch("app.services.auth.uuid.uuid4", return_value=user_id):
                await register_user(
                    db=mock_db,
                    email="  Test@Example.COM  ",
                    password="securepass",
                    display_name="  Alice  ",
                )

        mock_hash.assert_called_once_with("securepass")
        mock_redis.set.assert_called_once()
        set_args = mock_redis.set.call_args
        assert set_args[0][0].startswith("verify:")
        assert set_args[1]["ex"] == 86_400
        mock_thread.assert_called_once()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_silently_no_ops_on_duplicate_email(self) -> None:
        from app.services.auth import register_user

        existing_user = MagicMock()
        mock_db = _mock_db_returning(existing_user)

        with patch("app.services.auth._redis") as mock_redis_factory:
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            await register_user(
                db=mock_db,
                email="dup@example.com",
                password="securepass",
                display_name="Dup",
            )

        # No commit, no Redis write, no email
        mock_db.commit.assert_not_called()
        mock_redis.set.assert_not_called()


# ── Service: verify_email_token ────────────────────────────────────────────────


class TestVerifyEmailToken:
    @pytest.mark.asyncio
    async def test_valid_token_verifies_user(self) -> None:
        from app.services.auth import verify_email_token

        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.email_verified = False
        mock_db = _mock_db_returning(mock_user)

        with patch("app.services.auth._redis") as mock_redis_factory:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = str(user_id)
            mock_redis_factory.return_value = mock_redis

            result = await verify_email_token(db=mock_db, token="validtoken123")

        assert result is True
        assert mock_user.email_verified is True
        mock_redis.delete.assert_called_once_with("verify:validtoken123")
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_invalid_token_returns_false(self) -> None:
        from app.services.auth import verify_email_token

        mock_db = AsyncMock()

        with patch("app.services.auth._redis") as mock_redis_factory:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None
            mock_redis_factory.return_value = mock_redis

            result = await verify_email_token(db=mock_db, token="bogus")

        assert result is False
        mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_corrupted_uuid_returns_false(self) -> None:
        from app.services.auth import verify_email_token

        mock_db = AsyncMock()

        with patch("app.services.auth._redis") as mock_redis_factory:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = "not-a-uuid"
            mock_redis_factory.return_value = mock_redis

            result = await verify_email_token(db=mock_db, token="sometoken")

        assert result is False


# ── Service: authenticate_user ─────────────────────────────────────────────────


class TestAuthenticateUser:
    @pytest.mark.asyncio
    async def test_valid_credentials_return_tokens(self) -> None:
        from app.services.auth import authenticate_user

        mock_user = MagicMock()
        mock_user.hashed_password = "hashed"
        mock_user.is_active = True
        mock_user.email_verified = True
        mock_user.id = uuid.uuid4()
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth.verify_password", return_value=True),
            patch("app.services.auth.create_access_token", return_value="access.tok") as mac,
            patch("app.services.auth.create_refresh_token", return_value="refresh.tok") as mrc,
        ):
            access, refresh = await authenticate_user(
                db=mock_db, email="user@example.com", password="pass"
            )

        assert access == "access.tok"
        assert refresh == "refresh.tok"
        mac.assert_called_once_with(str(mock_user.id))
        mrc.assert_called_once_with(str(mock_user.id))
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_wrong_password_raises_auth_error(self) -> None:
        from app.services.auth import authenticate_user

        mock_user = MagicMock()
        mock_user.hashed_password = "hashed"
        mock_user.is_active = True
        mock_user.email_verified = True
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth.verify_password", return_value=False),
            pytest.raises(AuthError) as exc_info,
        ):
            await authenticate_user(db=mock_db, email="u@e.com", password="wrong")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_user_raises_auth_error(self) -> None:
        from app.services.auth import authenticate_user

        mock_db = _mock_db_returning(None)

        with (
            patch("app.services.auth.verify_password", return_value=False),
            pytest.raises(AuthError) as exc_info,
        ):
            await authenticate_user(db=mock_db, email="ghost@e.com", password="x")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_unverified_email_raises_403(self) -> None:
        from app.services.auth import authenticate_user

        mock_user = MagicMock()
        mock_user.hashed_password = "hashed"
        mock_user.is_active = True
        mock_user.email_verified = False
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth.verify_password", return_value=True),
            pytest.raises(AuthError) as exc_info,
        ):
            await authenticate_user(db=mock_db, email="u@e.com", password="pass")

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_inactive_user_raises_401(self) -> None:
        from app.services.auth import authenticate_user

        mock_user = MagicMock()
        mock_user.hashed_password = "hashed"
        mock_user.is_active = False
        mock_user.email_verified = True
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth.verify_password", return_value=True),
            pytest.raises(AuthError) as exc_info,
        ):
            await authenticate_user(db=mock_db, email="u@e.com", password="pass")

        assert exc_info.value.status_code == 401
