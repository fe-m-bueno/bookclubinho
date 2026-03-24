"""Testes unitários para os schemas de User."""

import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.user import UserCreate, UserPublic, UserRead, UserUpdate


class TestUserCreate:
    def test_minimal_fields(self) -> None:
        user = UserCreate(email="test@example.com")
        assert user.email == "test@example.com"
        assert user.auth_provider == "local"
        assert user.password is None
        assert user.username is None
        assert user.timezone == "America/Sao_Paulo"

    def test_with_password(self) -> None:
        user = UserCreate(email="test@example.com", password="s3cr3t")
        assert user.password == "s3cr3t"

    def test_sso_user_no_password(self) -> None:
        user = UserCreate(email="test@example.com", auth_provider="google")
        assert user.password is None
        assert user.auth_provider == "google"

    def test_invalid_email(self) -> None:
        with pytest.raises(ValidationError):
            UserCreate(email="not-an-email")

    def test_magic_link_provider(self) -> None:
        user = UserCreate(email="test@example.com", auth_provider="magic_link")
        assert user.auth_provider == "magic_link"


class TestUserUpdate:
    def test_empty_update(self) -> None:
        update = UserUpdate()
        assert update.username is None
        assert update.preferred_genres is None

    def test_partial_update(self) -> None:
        update = UserUpdate(display_name="New Name", preferred_genres=["fantasia", "sci-fi"])
        assert update.display_name == "New Name"
        assert update.preferred_genres == ["fantasia", "sci-fi"]
        assert update.username is None

    def test_status_text_update(self) -> None:
        update = UserUpdate(status_text="Lendo muito!")
        assert update.status_text == "Lendo muito!"

    def test_timezone_update(self) -> None:
        update = UserUpdate(timezone="America/Sao_Paulo")
        assert update.timezone == "America/Sao_Paulo"

    def test_invalid_timezone_raises(self) -> None:
        with pytest.raises(ValidationError, match="inválido"):
            UserUpdate(timezone="Invalid/Timezone")

    def test_invalid_genre_raises(self) -> None:
        with pytest.raises(ValidationError, match="inválidos"):
            UserUpdate(preferred_genres=["genero-invalido-xyz"])


class TestUserRead:
    def _make_user_data(self, **overrides: object) -> dict:
        base: dict = {
            "id": uuid.uuid4(),
            "email": "user@example.com",
            "username": "bookworm",
            "display_name": "Book Worm",
            "avatar_url": None,
            "status_text": None,
            "auth_provider": "local",
            "preferred_genres": ["Fiction"],
            "onboarding_completed": False,
            "email_notifications": {
                "meetings": True,
                "invites": True,
                "auth": True,
                "approaching_end": False,
                "all_updates": False,
            },
            "streak_current": 5,
            "streak_longest": 10,
            "streak_last_update": None,
            "total_reading_time_minutes": 120,
            "timezone": "America/Sao_Paulo",
            "is_active": True,
            "last_login_at": None,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        base.update(overrides)
        return base

    def test_valid_user_read(self) -> None:
        data = self._make_user_data()
        user = UserRead(**data)
        assert user.email == "user@example.com"
        assert user.streak_current == 5
        assert user.auth_provider == "local"

    def test_contains_sensitive_fields(self) -> None:
        data = self._make_user_data()
        user = UserRead(**data)
        # UserRead expõe email e email_notifications (só para o próprio usuário)
        assert hasattr(user, "email")
        assert hasattr(user, "email_notifications")

    def test_from_attributes(self) -> None:
        # Valida que model_config from_attributes está habilitado
        assert UserRead.model_config.get("from_attributes") is True


class TestUserPublic:
    def _make_public_data(self, **overrides: object) -> dict:
        base: dict = {
            "id": uuid.uuid4(),
            "username": "bookworm",
            "display_name": "Book Worm",
            "avatar_url": None,
            "status_text": None,
            "preferred_genres": ["Fiction", "Mystery"],
            "streak_current": 3,
            "streak_longest": 7,
            "total_reading_time_minutes": 60,
            "timezone": "America/Sao_Paulo",
            "is_active": True,
            "created_at": datetime.now(UTC),
        }
        base.update(overrides)
        return base

    def test_valid_user_public(self) -> None:
        data = self._make_public_data()
        user = UserPublic(**data)
        assert user.username == "bookworm"
        assert user.streak_current == 3

    def test_excludes_sensitive_fields(self) -> None:
        UserPublic(**self._make_public_data())
        fields = set(UserPublic.model_fields.keys())
        assert "email" not in fields
        assert "hashed_password" not in fields
        assert "hardcover_token_encrypted" not in fields
        assert "email_notifications" not in fields

    def test_from_attributes(self) -> None:
        assert UserPublic.model_config.get("from_attributes") is True

    def test_empty_preferred_genres_default(self) -> None:
        data = self._make_public_data()
        data.pop("preferred_genres")
        user = UserPublic(**data)
        assert user.preferred_genres == []

    def test_null_username(self) -> None:
        data = self._make_public_data(username=None)
        user = UserPublic(**data)
        assert user.username is None
