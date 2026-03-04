"""Testes unitários para os endpoints e serviços de autenticação."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.auth import LoginResponse, LogoutResponse, RefreshResponse, RegisterRequest, RegisterResponse, VerifyEmailResponse
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


# ── Service: resend_verification_email ─────────────────────────────────────────


class TestResendVerificationEmail:
    @pytest.mark.asyncio
    async def test_sends_email_for_unverified_user(self) -> None:
        from app.services.auth import resend_verification_email

        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email_verified = False
        mock_user.display_name = "Alice"
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await resend_verification_email(db=mock_db, email="alice@example.com")

        mock_thread.assert_called_once()
        # Redis set should store verify token
        mock_redis.set.assert_called_once()
        set_args = mock_redis.set.call_args
        assert set_args[0][0].startswith("verify:")
        assert set_args[1]["ex"] == 86_400

    @pytest.mark.asyncio
    async def test_silently_returns_for_nonexistent_email(self) -> None:
        from app.services.auth import resend_verification_email

        mock_db = _mock_db_returning(None)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await resend_verification_email(db=mock_db, email="ghost@example.com")

        mock_thread.assert_not_called()

    @pytest.mark.asyncio
    async def test_silently_returns_for_already_verified_email(self) -> None:
        from app.services.auth import resend_verification_email

        mock_user = MagicMock()
        mock_user.email_verified = True
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await resend_verification_email(db=mock_db, email="verified@example.com")

        mock_thread.assert_not_called()

    @pytest.mark.asyncio
    async def test_rate_limit_silently_skips(self) -> None:
        from app.services.auth import resend_verification_email

        mock_db = _mock_db_returning(None)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock) as mock_thread,
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 4  # acima do limite de 3
            mock_redis_factory.return_value = mock_redis

            await resend_verification_email(db=mock_db, email="spam@example.com")

        mock_thread.assert_not_called()
        mock_db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_first_request_sets_expire(self) -> None:
        from app.services.auth import resend_verification_email

        mock_user = MagicMock()
        mock_user.id = uuid.uuid4()
        mock_user.email_verified = False
        mock_user.display_name = "Test"
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock),
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await resend_verification_email(db=mock_db, email="first@example.com")

        mock_redis.expire.assert_called_once_with(
            "resend_verify_rate:first@example.com", 3600
        )


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


# ── Service: send_magic_link ───────────────────────────────────────────────────


class TestSendMagicLink:
    @pytest.mark.asyncio
    async def test_new_user_created_with_magic_link_provider(self) -> None:
        from app.services.auth import send_magic_link

        mock_db = _mock_db_returning(None)  # no existing user

        user_id = uuid.uuid4()

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock),
            patch("app.services.auth.uuid.uuid4", return_value=user_id),
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await send_magic_link(db=mock_db, email="new@example.com")

        # flush chamado para obter o id antes do commit
        mock_db.flush.assert_called_once()
        mock_db.commit.assert_called_once()

        # verifica que o usuário criado tem os campos corretos
        added_user = mock_db.add.call_args[0][0]
        assert added_user.auth_provider == "magic_link"
        assert added_user.email_verified is True
        assert added_user.hashed_password is None

    @pytest.mark.asyncio
    async def test_existing_user_skips_flush(self) -> None:
        from app.services.auth import send_magic_link

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.display_name = "Felipe"
        mock_db = _mock_db_returning(existing_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock),
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await send_magic_link(db=mock_db, email="existing@example.com")

        mock_db.flush.assert_not_called()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_rate_limit_silently_skips_email(self) -> None:
        from app.services.auth import send_magic_link

        mock_db = _mock_db_returning(None)

        with patch("app.services.auth._redis") as mock_redis_factory:
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 6  # acima do limite de 5
            mock_redis_factory.return_value = mock_redis

            await send_magic_link(db=mock_db, email="spam@example.com")

        # nenhuma operação de DB ou email
        mock_db.commit.assert_not_called()
        mock_db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_first_request_sets_expire(self) -> None:
        from app.services.auth import send_magic_link

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.display_name = "Test"
        mock_db = _mock_db_returning(existing_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock),
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1  # primeira requisição
            mock_redis_factory.return_value = mock_redis

            await send_magic_link(db=mock_db, email="first@example.com")

        mock_redis.expire.assert_called_once_with("magic_rate:first@example.com", 3600)

    @pytest.mark.asyncio
    async def test_display_name_defaults_to_email_prefix(self) -> None:
        from app.services.auth import send_magic_link

        mock_db = _mock_db_returning(None)
        user_id = uuid.uuid4()

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.asyncio.to_thread", new_callable=AsyncMock),
            patch("app.services.auth.uuid.uuid4", return_value=user_id),
        ):
            mock_redis = AsyncMock()
            mock_redis.incr.return_value = 1
            mock_redis_factory.return_value = mock_redis

            await send_magic_link(db=mock_db, email="myuser@domain.com")

        added_user = mock_db.add.call_args[0][0]
        assert added_user.display_name == "myuser"


# ── Service: consume_magic_token ──────────────────────────────────────────────


class TestConsumeMagicToken:
    @pytest.mark.asyncio
    async def test_valid_token_returns_tokens_and_onboarding(self) -> None:
        from app.services.auth import consume_magic_token

        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.is_active = True
        mock_user.onboarding_completed = True
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.create_access_token", return_value="acc.tok"),
            patch("app.services.auth.create_refresh_token", return_value="ref.tok"),
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = str(user_id)
            mock_redis_factory.return_value = mock_redis

            access, refresh, onboarding = await consume_magic_token(
                db=mock_db, token="validtoken"
            )

        assert access == "acc.tok"
        assert refresh == "ref.tok"
        assert onboarding is True
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_missing_token_raises_auth_error(self) -> None:
        from app.services.auth import consume_magic_token

        mock_db = AsyncMock()

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            pytest.raises(AuthError) as exc_info,
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None
            mock_redis_factory.return_value = mock_redis

            await consume_magic_token(db=mock_db, token="expired")

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_corrupted_uuid_raises_auth_error(self) -> None:
        from app.services.auth import consume_magic_token

        mock_db = AsyncMock()

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            pytest.raises(AuthError) as exc_info,
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = "not-a-uuid"
            mock_redis_factory.return_value = mock_redis

            await consume_magic_token(db=mock_db, token="badtoken")

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_inactive_user_raises_auth_error(self) -> None:
        from app.services.auth import consume_magic_token

        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.is_active = False
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            pytest.raises(AuthError) as exc_info,
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = str(user_id)
            mock_redis_factory.return_value = mock_redis

            await consume_magic_token(db=mock_db, token="inactivetoken")

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_token_deleted_before_db_lookup(self) -> None:
        from app.services.auth import consume_magic_token

        user_id = uuid.uuid4()
        call_order: list[str] = []

        mock_user = MagicMock()
        mock_user.is_active = True
        mock_user.onboarding_completed = False

        result = MagicMock()
        result.scalar_one_or_none.return_value = mock_user

        mock_db = AsyncMock()

        async def fake_execute(_stmt: object) -> MagicMock:
            call_order.append("db_execute")
            return result

        mock_db.execute = fake_execute

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.create_access_token", return_value="a"),
            patch("app.services.auth.create_refresh_token", return_value="r"),
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = str(user_id)

            async def fake_delete(_key: str) -> None:
                call_order.append("redis_delete")

            mock_redis.delete = fake_delete
            mock_redis_factory.return_value = mock_redis

            await consume_magic_token(db=mock_db, token="ordertoken")

        assert call_order.index("redis_delete") < call_order.index("db_execute")

    @pytest.mark.asyncio
    async def test_onboarding_not_completed_returns_false(self) -> None:
        from app.services.auth import consume_magic_token

        user_id = uuid.uuid4()
        mock_user = MagicMock()
        mock_user.is_active = True
        mock_user.onboarding_completed = False
        mock_db = _mock_db_returning(mock_user)

        with (
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.create_access_token", return_value="a"),
            patch("app.services.auth.create_refresh_token", return_value="r"),
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = str(user_id)
            mock_redis_factory.return_value = mock_redis

            _, _, onboarding = await consume_magic_token(db=mock_db, token="tok")

        assert onboarding is False


# ── Service: blacklist_refresh_token ──────────────────────────────────────────


class TestBlacklistRefreshToken:
    @pytest.mark.asyncio
    async def test_valid_token_is_blacklisted(self) -> None:
        from app.services.auth import blacklist_refresh_token

        future_exp = int(datetime.now(UTC).timestamp()) + 3600
        payload = {"sub": "user-1", "exp": future_exp, "type": "refresh", "jti": "test-jti-123"}

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            patch("app.services.auth._redis") as mock_redis_factory,
        ):
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            await blacklist_refresh_token("any.token.here")

        mock_redis.set.assert_called_once()
        set_args = mock_redis.set.call_args
        assert set_args[0][0] == "token_blacklist:test-jti-123"
        assert set_args[0][1] == "1"
        assert set_args[1]["ex"] > 0

    @pytest.mark.asyncio
    async def test_jwt_error_returns_silently(self) -> None:
        from jose import JWTError

        from app.services.auth import blacklist_refresh_token

        with (
            patch("app.services.auth.decode_token", side_effect=JWTError("bad token")),
            patch("app.services.auth._redis") as mock_redis_factory,
        ):
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            await blacklist_refresh_token("bad.token")

        mock_redis.set.assert_not_called()

    @pytest.mark.asyncio
    async def test_expired_token_returns_silently(self) -> None:
        from app.services.auth import blacklist_refresh_token

        past_exp = int(datetime.now(UTC).timestamp()) - 10
        payload = {"sub": "user-1", "exp": past_exp, "type": "refresh", "jti": "old-jti"}

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            patch("app.services.auth._redis") as mock_redis_factory,
        ):
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            await blacklist_refresh_token("expired.token")

        mock_redis.set.assert_not_called()

    @pytest.mark.asyncio
    async def test_token_without_jti_returns_silently(self) -> None:
        from app.services.auth import blacklist_refresh_token

        future_exp = int(datetime.now(UTC).timestamp()) + 3600
        payload = {"sub": "user-1", "exp": future_exp, "type": "refresh"}  # sem jti

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            patch("app.services.auth._redis") as mock_redis_factory,
        ):
            mock_redis = AsyncMock()
            mock_redis_factory.return_value = mock_redis

            await blacklist_refresh_token("no.jti.token")

        mock_redis.set.assert_not_called()


# ── Service: rotate_refresh_token ─────────────────────────────────────────────


class TestRotateRefreshToken:
    @pytest.mark.asyncio
    async def test_valid_token_returns_new_pair(self) -> None:
        from app.services.auth import rotate_refresh_token

        future_exp = int(datetime.now(UTC).timestamp()) + 3600
        payload = {"sub": "user-42", "exp": future_exp, "type": "refresh", "jti": "valid-jti"}

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            patch("app.services.auth._redis") as mock_redis_factory,
            patch("app.services.auth.create_access_token", return_value="new.access") as mac,
            patch("app.services.auth.create_refresh_token", return_value="new.refresh") as mrc,
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None  # não blacklistado
            mock_redis_factory.return_value = mock_redis

            new_access, new_refresh = await rotate_refresh_token("old.token")

        assert new_access == "new.access"
        assert new_refresh == "new.refresh"
        mac.assert_called_once_with("user-42")
        mrc.assert_called_once_with("user-42")

    @pytest.mark.asyncio
    async def test_blacklisted_token_raises_401(self) -> None:
        from app.services.auth import rotate_refresh_token

        future_exp = int(datetime.now(UTC).timestamp()) + 3600
        payload = {"sub": "user-42", "exp": future_exp, "type": "refresh", "jti": "revoked-jti"}

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            patch("app.services.auth._redis") as mock_redis_factory,
            pytest.raises(AuthError) as exc_info,
        ):
            mock_redis = AsyncMock()
            mock_redis.get.return_value = "1"  # blacklistado
            mock_redis_factory.return_value = mock_redis

            await rotate_refresh_token("revoked.token")

        assert exc_info.value.status_code == 401
        assert "revogado" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_jwt_error_raises_401(self) -> None:
        from jose import JWTError

        from app.services.auth import rotate_refresh_token

        with (
            patch("app.services.auth.decode_token", side_effect=JWTError("bad")),
            pytest.raises(AuthError) as exc_info,
        ):
            await rotate_refresh_token("bad.token")

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_token_type_raises_401(self) -> None:
        from app.services.auth import rotate_refresh_token

        future_exp = int(datetime.now(UTC).timestamp()) + 3600
        payload = {"sub": "user-42", "exp": future_exp, "type": "access", "jti": "some-jti"}

        with (
            patch("app.services.auth.decode_token", return_value=payload),
            pytest.raises(AuthError) as exc_info,
        ):
            await rotate_refresh_token("access.token.used.as.refresh")

        assert exc_info.value.status_code == 401


# ── Endpoint: Logout ───────────────────────────────────────────────────────────


class TestLogoutEndpoint:
    @pytest.mark.asyncio
    async def test_logout_clears_cookies_and_returns_200(self) -> None:
        from fastapi import Response

        from app.api.v1.endpoints.auth import logout

        mock_response = MagicMock(spec=Response)

        with patch(
            "app.api.v1.endpoints.auth.blacklist_refresh_token",
            new_callable=AsyncMock,
        ) as mock_blacklist:
            result = await logout(response=mock_response, refresh_token="some.refresh.token")

        mock_blacklist.assert_called_once_with("some.refresh.token")
        mock_response.delete_cookie.assert_any_call("access_token", path="/")
        mock_response.delete_cookie.assert_any_call("refresh_token", path="/")
        assert isinstance(result, LogoutResponse)
        assert "sucesso" in result.message

    @pytest.mark.asyncio
    async def test_logout_no_token_still_returns_200(self) -> None:
        from fastapi import Response

        from app.api.v1.endpoints.auth import logout

        mock_response = MagicMock(spec=Response)

        with patch(
            "app.api.v1.endpoints.auth.blacklist_refresh_token",
            new_callable=AsyncMock,
        ) as mock_blacklist:
            result = await logout(response=mock_response, refresh_token=None)

        mock_blacklist.assert_not_called()
        mock_response.delete_cookie.assert_any_call("access_token", path="/")
        mock_response.delete_cookie.assert_any_call("refresh_token", path="/")
        assert isinstance(result, LogoutResponse)


# ── Endpoint: Refresh ──────────────────────────────────────────────────────────


class TestRefreshEndpoint:
    @pytest.mark.asyncio
    async def test_refresh_sets_new_cookies(self) -> None:
        from fastapi import Response

        from app.api.v1.endpoints.auth import refresh

        mock_response = MagicMock(spec=Response)

        with patch(
            "app.api.v1.endpoints.auth.rotate_refresh_token",
            new_callable=AsyncMock,
            return_value=("new.access", "new.refresh"),
        ):
            result = await refresh(response=mock_response, refresh_token="valid.refresh.token")

        assert isinstance(result, RefreshResponse)
        assert "renovados" in result.message
        mock_response.set_cookie.assert_called()

    @pytest.mark.asyncio
    async def test_refresh_no_token_returns_401(self) -> None:
        from fastapi import HTTPException, Response

        from app.api.v1.endpoints.auth import refresh

        mock_response = MagicMock(spec=Response)

        with pytest.raises(HTTPException) as exc_info:
            await refresh(response=mock_response, refresh_token=None)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_invalid_token_returns_401(self) -> None:
        from fastapi import HTTPException, Response

        from app.api.v1.endpoints.auth import refresh

        mock_response = MagicMock(spec=Response)

        with (
            patch(
                "app.api.v1.endpoints.auth.rotate_refresh_token",
                new_callable=AsyncMock,
                side_effect=AuthError("Token inválido ou expirado.", status_code=401),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await refresh(response=mock_response, refresh_token="invalid.token")

        assert exc_info.value.status_code == 401


# ── Service: google_oauth_callback ────────────────────────────────────────────


def _mock_httpx_client(token_status: int = 200, userinfo_status: int = 200) -> MagicMock:
    """Cria um mock de httpx.AsyncClient context manager."""
    token_resp = MagicMock()
    token_resp.status_code = token_status
    token_resp.json.return_value = {"access_token": "google_access_token"}

    userinfo_resp = MagicMock()
    userinfo_resp.status_code = userinfo_status
    userinfo_resp.json.return_value = {
        "email": "user@gmail.com",
        "verified_email": True,
        "name": "Test User",
        "picture": "https://lh3.googleusercontent.com/photo.jpg",
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=token_resp)
    mock_client.get = AsyncMock(return_value=userinfo_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    return mock_client


class TestGoogleOAuthCallback:
    @pytest.mark.asyncio
    async def test_exchanges_code_and_creates_new_user(self) -> None:
        from app.services.auth import google_oauth_callback

        mock_db = _mock_db_returning(None)  # usuário não existe
        user_id = uuid.uuid4()
        mock_client = _mock_httpx_client()

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            patch("app.services.auth.uuid.uuid4", return_value=user_id),
            patch("app.services.auth.create_access_token", return_value="acc"),
            patch("app.services.auth.create_refresh_token", return_value="ref"),
        ):
            access, refresh, onboarding = await google_oauth_callback(
                code="authcode", db=mock_db
            )

        assert access == "acc"
        assert refresh == "ref"
        mock_db.flush.assert_called_once()
        mock_db.commit.assert_called_once()

        added_user = mock_db.add.call_args[0][0]
        assert added_user.auth_provider == "google"
        assert added_user.email_verified is True
        assert added_user.hashed_password is None
        assert added_user.email == "user@gmail.com"

    @pytest.mark.asyncio
    async def test_merges_existing_local_user(self) -> None:
        from app.services.auth import google_oauth_callback

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.auth_provider = "local"
        existing_user.avatar_url = None
        existing_user.onboarding_completed = True
        mock_db = _mock_db_returning(existing_user)
        mock_client = _mock_httpx_client()

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            patch("app.services.auth.create_access_token", return_value="a"),
            patch("app.services.auth.create_refresh_token", return_value="r"),
        ):
            await google_oauth_callback(code="code", db=mock_db)

        assert existing_user.auth_provider == "google"
        mock_db.flush.assert_not_called()
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_merges_existing_magic_link_user(self) -> None:
        from app.services.auth import google_oauth_callback

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.auth_provider = "magic_link"
        existing_user.avatar_url = None
        existing_user.onboarding_completed = False
        mock_db = _mock_db_returning(existing_user)
        mock_client = _mock_httpx_client()

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            patch("app.services.auth.create_access_token", return_value="a"),
            patch("app.services.auth.create_refresh_token", return_value="r"),
        ):
            await google_oauth_callback(code="code", db=mock_db)

        assert existing_user.auth_provider == "google"

    @pytest.mark.asyncio
    async def test_preserves_existing_avatar_on_merge(self) -> None:
        from app.services.auth import google_oauth_callback

        existing_user = MagicMock()
        existing_user.id = uuid.uuid4()
        existing_user.auth_provider = "local"
        existing_user.avatar_url = "https://existing-avatar.com/photo.jpg"
        existing_user.onboarding_completed = True
        mock_db = _mock_db_returning(existing_user)
        mock_client = _mock_httpx_client()

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            patch("app.services.auth.create_access_token", return_value="a"),
            patch("app.services.auth.create_refresh_token", return_value="r"),
        ):
            await google_oauth_callback(code="code", db=mock_db)

        # avatar existente deve ser preservado
        assert existing_user.avatar_url == "https://existing-avatar.com/photo.jpg"

    @pytest.mark.asyncio
    async def test_unverified_google_email_raises_auth_error(self) -> None:
        from app.services.auth import google_oauth_callback

        mock_db = _mock_db_returning(None)

        token_resp = MagicMock()
        token_resp.status_code = 200
        token_resp.json.return_value = {"access_token": "tok"}

        userinfo_resp = MagicMock()
        userinfo_resp.status_code = 200
        userinfo_resp.json.return_value = {
            "email": "user@gmail.com",
            "verified_email": False,
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        mock_client.get = AsyncMock(return_value=userinfo_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            pytest.raises(AuthError) as exc_info,
        ):
            await google_oauth_callback(code="code", db=mock_db)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_google_token_exchange_failure_raises_auth_error(self) -> None:
        from app.services.auth import google_oauth_callback

        mock_db = _mock_db_returning(None)
        mock_client = _mock_httpx_client(token_status=400)

        with (
            patch("app.services.auth.httpx.AsyncClient", return_value=mock_client),
            pytest.raises(AuthError) as exc_info,
        ):
            await google_oauth_callback(code="bad_code", db=mock_db)

        assert exc_info.value.status_code == 400


# ── Endpoint: Google OAuth ─────────────────────────────────────────────────────


class TestGoogleOAuthEndpoints:
    @pytest.mark.asyncio
    async def test_google_login_redirects_to_google(self) -> None:
        from app.api.v1.endpoints.auth import google_login

        mock_redis = AsyncMock()

        with patch("app.api.v1.endpoints.auth._redis_client", return_value=mock_redis):
            response = await google_login()

        assert response.status_code == 302
        location = response.headers["location"]
        assert "accounts.google.com" in location
        assert "response_type=code" in location
        assert "scope=" in location
        assert "state=" in location
        mock_redis.set.assert_called_once()
        set_args = mock_redis.set.call_args
        assert set_args[0][0].startswith("oauth_state:")
        assert set_args[1]["ex"] == 600

    @pytest.mark.asyncio
    async def test_google_callback_invalid_state_redirects_error(self) -> None:
        from app.api.v1.endpoints.auth import google_callback

        mock_db = AsyncMock()
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None  # state não encontrado

        with patch("app.api.v1.endpoints.auth._redis_client", return_value=mock_redis):
            response = await google_callback(
                db=mock_db, code="somecode", state="invalidstate", error=None
            )

        assert response.status_code == 303
        assert "login?error=oauth_failed" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_google_callback_sets_cookies_and_redirects(self) -> None:
        from app.api.v1.endpoints.auth import google_callback

        mock_db = _mock_db_returning(None)
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "1"  # state válido

        with (
            patch("app.api.v1.endpoints.auth._redis_client", return_value=mock_redis),
            patch(
                "app.api.v1.endpoints.auth.google_oauth_callback",
                new_callable=AsyncMock,
                return_value=("acc.tok", "ref.tok", True),
            ),
        ):
            response = await google_callback(
                db=mock_db, code="validcode", state="validstate", error=None
            )

        assert response.status_code == 303
        # redireciona para / quando onboarding_completed=True
        location = response.headers["location"]
        assert location.endswith("/")
        mock_redis.delete.assert_called_once_with("oauth_state:validstate")

    @pytest.mark.asyncio
    async def test_google_callback_error_param_redirects(self) -> None:
        from app.api.v1.endpoints.auth import google_callback

        mock_db = AsyncMock()

        response = await google_callback(
            db=mock_db, code=None, state=None, error="access_denied"
        )

        assert response.status_code == 303
        assert "login?error=oauth_failed" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_google_callback_auth_error_redirects(self) -> None:
        from app.api.v1.endpoints.auth import google_callback

        mock_db = _mock_db_returning(None)
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "1"

        with (
            patch("app.api.v1.endpoints.auth._redis_client", return_value=mock_redis),
            patch(
                "app.api.v1.endpoints.auth.google_oauth_callback",
                new_callable=AsyncMock,
                side_effect=AuthError("Falha OAuth", status_code=400),
            ),
        ):
            response = await google_callback(
                db=mock_db, code="badcode", state="validstate", error=None
            )

        assert response.status_code == 303
        assert "login?error=oauth_failed" in response.headers["location"]
