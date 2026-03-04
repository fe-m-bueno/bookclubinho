"""Testes unitários para os endpoints e serviços de onboarding."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.schemas.onboarding import PreferencesRequest, UsernameCheckResponse
from app.services.onboarding import OnboardingError

# ── helpers ────────────────────────────────────────────────────────────────────


def _mock_db_returning(value: object) -> AsyncMock:
    """AsyncSession mock cujo execute() retorna scalar_one_or_none = value."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def _make_user(**overrides: object) -> MagicMock:
    """Cria um mock de User com defaults sensíveis."""
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username")
    user.display_name = overrides.get("display_name")
    user.avatar_url = overrides.get("avatar_url")
    user.status_text = overrides.get("status_text")
    user.preferred_genres = overrides.get("preferred_genres", [])
    user.onboarding_completed = overrides.get("onboarding_completed", False)
    return user


# ── Schema: PreferencesRequest ────────────────────────────────────────────────


class TestPreferencesRequest:
    def test_valid_genres(self) -> None:
        req = PreferencesRequest(preferred_genres=["fantasy", "sci-fi", "romance"])
        assert req.preferred_genres == ["fantasy", "sci-fi", "romance"]

    def test_invalid_genre_raises(self) -> None:
        with pytest.raises(ValidationError, match="inválidos"):
            PreferencesRequest(preferred_genres=["fantasy", "invalid-genre"])

    def test_empty_list_raises(self) -> None:
        with pytest.raises(ValidationError, match="pelo menos 1"):
            PreferencesRequest(preferred_genres=[])

    def test_exceeds_max_raises(self) -> None:
        genres = [
            "fantasy", "sci-fi", "romance", "mystery", "thriller",
            "horror", "memoir", "biography", "self-help", "psychology",
            "philosophy",
        ]
        with pytest.raises(ValidationError, match="máximo 10"):
            PreferencesRequest(preferred_genres=genres)

    def test_deduplication(self) -> None:
        req = PreferencesRequest(preferred_genres=["fantasy", "fantasy", "romance"])
        assert req.preferred_genres == ["fantasy", "romance"]


class TestUsernameCheckResponse:
    def test_available(self) -> None:
        r = UsernameCheckResponse(available=True)
        assert r.available is True

    def test_unavailable(self) -> None:
        r = UsernameCheckResponse(available=False)
        assert r.available is False


# ── Service: check_username_available ─────────────────────────────────────────


class TestCheckUsernameAvailable:
    @pytest.mark.asyncio
    async def test_available_username(self) -> None:
        from app.services.onboarding import check_username_available

        mock_db = _mock_db_returning(None)
        result = await check_username_available(db=mock_db, username="newuser")
        assert result is True

    @pytest.mark.asyncio
    async def test_taken_username(self) -> None:
        from app.services.onboarding import check_username_available

        existing = MagicMock()
        mock_db = _mock_db_returning(existing)
        result = await check_username_available(db=mock_db, username="taken")
        assert result is False


# ── Service: update_profile ──────────────────────────────────────────────────


class TestUpdateProfile:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)  # no username conflict

        await update_profile(
            db=mock_db,
            user=user,
            username="ValidUser",
            display_name="Felipe Bueno",
            status_text="Lendo muito!",
        )

        assert user.username == "ValidUser"
        assert user.display_name == "Felipe Bueno"
        assert user.status_text == "Lendo muito!"

    @pytest.mark.asyncio
    async def test_username_too_short(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="3-20 caracteres"):
            await update_profile(
                db=mock_db, user=user, username="ab", display_name="Test User"
            )

    @pytest.mark.asyncio
    async def test_username_starts_with_number(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="começar com letra"):
            await update_profile(
                db=mock_db, user=user, username="1abc", display_name="Test User"
            )

    @pytest.mark.asyncio
    async def test_username_invalid_chars(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="começar com letra"):
            await update_profile(
                db=mock_db, user=user, username="user@name", display_name="Test"
            )

    @pytest.mark.asyncio
    async def test_username_duplicate(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        existing = MagicMock()
        mock_db = _mock_db_returning(existing)  # conflict found

        with pytest.raises(OnboardingError, match="já está em uso"):
            await update_profile(
                db=mock_db, user=user, username="taken", display_name="Test User"
            )

    @pytest.mark.asyncio
    async def test_resave_own_username(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user(username="myuser")
        # Return None = no conflict (self is excluded in the query)
        mock_db = _mock_db_returning(None)

        await update_profile(
            db=mock_db, user=user, username="myuser", display_name="My Name"
        )

        assert user.username == "myuser"

    @pytest.mark.asyncio
    async def test_display_name_too_short(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)  # no username conflict

        with pytest.raises(OnboardingError, match="pelo menos 2"):
            await update_profile(
                db=mock_db, user=user, username="validuser", display_name="A"
            )

    @pytest.mark.asyncio
    async def test_display_name_too_long(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)  # no username conflict

        with pytest.raises(OnboardingError, match="máximo 50"):
            await update_profile(
                db=mock_db, user=user, username="validuser", display_name="A" * 51
            )

    @pytest.mark.asyncio
    async def test_status_text_too_long(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)

        with pytest.raises(OnboardingError, match="máximo 100"):
            await update_profile(
                db=mock_db,
                user=user,
                username="validuser",
                display_name="Valid Name",
                status_text="X" * 101,
            )

    @pytest.mark.asyncio
    async def test_avatar_upload(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)

        mock_avatar = AsyncMock()
        mock_avatar.read = AsyncMock(return_value=b"fake-image-data")
        mock_avatar.content_type = "image/png"

        with patch(
            "app.services.onboarding.asyncio.to_thread",
            new_callable=AsyncMock,
            return_value="https://cdn.example.com/avatars/test.webp",
        ) as mock_thread:
            await update_profile(
                db=mock_db,
                user=user,
                username="validuser",
                display_name="Valid Name",
                avatar=mock_avatar,
            )

        assert user.avatar_url == "https://cdn.example.com/avatars/test.webp"
        mock_thread.assert_called_once()

    @pytest.mark.asyncio
    async def test_avatar_too_large(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)

        mock_avatar = AsyncMock()
        mock_avatar.read = AsyncMock(return_value=b"x" * (5 * 1024 * 1024 + 1))
        mock_avatar.content_type = "image/png"

        with pytest.raises(OnboardingError, match="máximo 5MB"):
            await update_profile(
                db=mock_db,
                user=user,
                username="validuser",
                display_name="Valid Name",
                avatar=mock_avatar,
            )

    @pytest.mark.asyncio
    async def test_html_sanitization(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user()
        mock_db = _mock_db_returning(None)

        await update_profile(
            db=mock_db,
            user=user,
            username="validuser",
            display_name="<script>alert('xss')</script>Felipe",
            status_text="<b>Bold</b> text",
        )

        assert "<script>" not in user.display_name
        assert "<b>" not in user.status_text

    @pytest.mark.asyncio
    async def test_no_avatar(self) -> None:
        from app.services.onboarding import update_profile

        user = _make_user(avatar_url="https://old.com/avatar.webp")
        mock_db = _mock_db_returning(None)

        await update_profile(
            db=mock_db,
            user=user,
            username="validuser",
            display_name="Valid Name",
            avatar=None,
        )

        # Avatar should remain unchanged
        assert user.avatar_url == "https://old.com/avatar.webp"


# ── Service: update_preferences ──────────────────────────────────────────────


class TestUpdatePreferences:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.services.onboarding import update_preferences

        user = _make_user()
        mock_db = AsyncMock()

        await update_preferences(
            db=mock_db, user=user, preferred_genres=["fantasy", "sci-fi"]
        )

        assert user.preferred_genres == ["fantasy", "sci-fi"]

    @pytest.mark.asyncio
    async def test_invalid_genre(self) -> None:
        from app.services.onboarding import update_preferences

        user = _make_user()
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="inválidos"):
            await update_preferences(
                db=mock_db, user=user, preferred_genres=["fantasy", "bogus"]
            )


# ── Service: complete_onboarding ─────────────────────────────────────────────


class TestCompleteOnboarding:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.services.onboarding import complete_onboarding

        user = _make_user(
            username="validuser",
            display_name="Valid Name",
            preferred_genres=["fantasy"],
        )
        mock_db = AsyncMock()

        await complete_onboarding(db=mock_db, user=user)

        assert user.onboarding_completed is True

    @pytest.mark.asyncio
    async def test_missing_username(self) -> None:
        from app.services.onboarding import complete_onboarding

        user = _make_user(
            username=None,
            display_name="Valid Name",
            preferred_genres=["fantasy"],
        )
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="Username é obrigatório"):
            await complete_onboarding(db=mock_db, user=user)

    @pytest.mark.asyncio
    async def test_missing_display_name(self) -> None:
        from app.services.onboarding import complete_onboarding

        user = _make_user(
            username="validuser",
            display_name=None,
            preferred_genres=["fantasy"],
        )
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="Nome é obrigatório"):
            await complete_onboarding(db=mock_db, user=user)

    @pytest.mark.asyncio
    async def test_missing_genres(self) -> None:
        from app.services.onboarding import complete_onboarding

        user = _make_user(
            username="validuser",
            display_name="Valid Name",
            preferred_genres=[],
        )
        mock_db = AsyncMock()

        with pytest.raises(OnboardingError, match="pelo menos 1 gênero"):
            await complete_onboarding(db=mock_db, user=user)


# ── Endpoint: POST /onboarding/profile ───────────────────────────────────────


class TestOnboardingProfileEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.onboarding import onboarding_profile
        from app.schemas.onboarding import OnboardingProfileResponse

        mock_db = AsyncMock()
        mock_user = _make_user()

        with patch(
            "app.api.v1.endpoints.onboarding.update_profile",
            new_callable=AsyncMock,
        ):
            result = await onboarding_profile(
                db=mock_db,
                user=mock_user,
                username="validuser",
                display_name="Valid Name",
                status_text=None,
                avatar=None,
            )

        assert isinstance(result, OnboardingProfileResponse)
        assert "sucesso" in result.message

    @pytest.mark.asyncio
    async def test_error_returns_400(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.onboarding import onboarding_profile

        mock_db = AsyncMock()
        mock_user = _make_user()

        with (
            patch(
                "app.api.v1.endpoints.onboarding.update_profile",
                new_callable=AsyncMock,
                side_effect=OnboardingError("Username inválido"),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await onboarding_profile(
                db=mock_db,
                user=mock_user,
                username="ab",
                display_name="Test",
                status_text=None,
                avatar=None,
            )

        assert exc_info.value.status_code == 400


# ── Endpoint: POST /onboarding/preferences ──────────────────────────────────


class TestOnboardingPreferencesEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.onboarding import onboarding_preferences
        from app.schemas.onboarding import PreferencesResponse

        mock_db = AsyncMock()
        mock_user = _make_user()
        body = PreferencesRequest(preferred_genres=["fantasy", "sci-fi"])

        with patch(
            "app.api.v1.endpoints.onboarding.update_preferences",
            new_callable=AsyncMock,
        ):
            result = await onboarding_preferences(
                body=body, db=mock_db, user=mock_user
            )

        assert isinstance(result, PreferencesResponse)
        assert "sucesso" in result.message

    @pytest.mark.asyncio
    async def test_error_returns_400(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.onboarding import onboarding_preferences

        mock_db = AsyncMock()
        mock_user = _make_user()
        body = PreferencesRequest(preferred_genres=["fantasy"])

        with (
            patch(
                "app.api.v1.endpoints.onboarding.update_preferences",
                new_callable=AsyncMock,
                side_effect=OnboardingError("Gêneros inválidos"),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await onboarding_preferences(body=body, db=mock_db, user=mock_user)

        assert exc_info.value.status_code == 400


# ── Endpoint: POST /onboarding/complete ──────────────────────────────────────


class TestOnboardingCompleteEndpoint:
    @pytest.mark.asyncio
    async def test_success(self) -> None:
        from app.api.v1.endpoints.onboarding import onboarding_complete
        from app.schemas.onboarding import OnboardingCompleteResponse

        mock_db = AsyncMock()
        mock_user = _make_user()

        with patch(
            "app.api.v1.endpoints.onboarding.complete_onboarding",
            new_callable=AsyncMock,
        ):
            result = await onboarding_complete(db=mock_db, user=mock_user)

        assert isinstance(result, OnboardingCompleteResponse)
        assert "sucesso" in result.message

    @pytest.mark.asyncio
    async def test_error_returns_400(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.endpoints.onboarding import onboarding_complete

        mock_db = AsyncMock()
        mock_user = _make_user()

        with (
            patch(
                "app.api.v1.endpoints.onboarding.complete_onboarding",
                new_callable=AsyncMock,
                side_effect=OnboardingError("Username é obrigatório"),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await onboarding_complete(db=mock_db, user=mock_user)

        assert exc_info.value.status_code == 400
