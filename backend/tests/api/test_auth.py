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
