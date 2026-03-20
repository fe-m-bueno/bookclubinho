"""Testes para endpoints de perfil de usuário (PATCH /me, avatar, GET profile)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.users import router as users_router
from app.services.user_profile import ProfileError
from tests.conftest import make_user, mock_db_returning


def _make_full_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email = overrides.get("email", "user@test.com")
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url", None)
    user.status_text = overrides.get("status_text", None)
    user.auth_provider = overrides.get("auth_provider", "local")
    user.preferred_genres = overrides.get("preferred_genres", ["fantasia"])
    user.onboarding_completed = overrides.get("onboarding_completed", True)
    user.email_notifications = overrides.get("email_notifications", {})
    user.streak_current = overrides.get("streak_current", 0)
    user.streak_longest = overrides.get("streak_longest", 0)
    user.streak_last_update = overrides.get("streak_last_update", None)
    user.total_reading_time_minutes = overrides.get("total_reading_time_minutes", 0)
    user.timezone = overrides.get("timezone", "America/Sao_Paulo")
    user.is_active = overrides.get("is_active", True)
    user.last_login_at = overrides.get("last_login_at", None)
    user.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    user.updated_at = overrides.get("updated_at", datetime(2026, 1, 1, tzinfo=UTC))
    return user


app = FastAPI()
app.include_router(users_router, prefix="/api/v1/users")


def _override_user(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── PATCH /me ─────────────────────────────────────────────────────────────────


class TestPatchMe:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_patch_me_display_name(self) -> None:
        with patch("app.api.v1.endpoints.users.update_user_profile", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = self.user
            self.user.display_name = "Novo Nome"
            resp = self.client.patch(
                "/api/v1/users/me",
                json={"display_name": "Novo Nome"},
            )
        assert resp.status_code == 200
        mock_update.assert_called_once()

    def test_patch_me_username_conflict(self) -> None:
        with patch("app.api.v1.endpoints.users.update_user_profile", new_callable=AsyncMock) as mock_update:
            mock_update.side_effect = ProfileError("Username já está em uso.", status_code=409)
            resp = self.client.patch(
                "/api/v1/users/me",
                json={"username": "takenuser"},
            )
        assert resp.status_code == 409
        assert "Username" in resp.json()["detail"]

    def test_patch_me_invalid_genre(self) -> None:
        resp = self.client.patch(
            "/api/v1/users/me",
            json={"preferred_genres": ["genero-invalido-xyz"]},
        )
        assert resp.status_code == 422

    def test_patch_me_invalid_timezone(self) -> None:
        resp = self.client.patch(
            "/api/v1/users/me",
            json={"timezone": "Invalid/Timezone"},
        )
        assert resp.status_code == 422


# ── POST /me/avatar ───────────────────────────────────────────────────────────


class TestUploadAvatar:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_upload_avatar_success(self) -> None:
        expected_url = "https://cdn.example.com/avatars/test.webp"
        with patch("app.api.v1.endpoints.users.svc_upload_avatar", new_callable=AsyncMock) as mock_upload:
            mock_upload.return_value = expected_url
            # Minimal valid JPEG header
            fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 100
            resp = self.client.post(
                "/api/v1/users/me/avatar",
                files={"avatar": ("photo.jpg", fake_image, "image/jpeg")},
            )
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] == expected_url

    def test_upload_avatar_too_large(self) -> None:
        with patch("app.api.v1.endpoints.users.svc_upload_avatar", new_callable=AsyncMock) as mock_upload:
            mock_upload.side_effect = ProfileError("Avatar deve ter no máximo 5MB.")
            fake_image = b"\xff\xd8\xff\xe0" + b"\x00" * 100
            resp = self.client.post(
                "/api/v1/users/me/avatar",
                files={"avatar": ("big.jpg", fake_image, "image/jpeg")},
            )
        assert resp.status_code == 400


# ── DELETE /me/avatar ─────────────────────────────────────────────────────────


class TestDeleteAvatar:
    def setup_method(self) -> None:
        self.user = _make_full_user(avatar_url="https://cdn.example.com/avatar.webp")
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_delete_avatar_success(self) -> None:
        with patch("app.api.v1.endpoints.users.svc_delete_avatar", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = None
            resp = self.client.delete("/api/v1/users/me/avatar")
        assert resp.status_code == 200
        assert resp.json()["detail"] == "ok"


# ── GET /{user_id}/profile ────────────────────────────────────────────────────


class TestGetUserProfile:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_public_profile(self) -> None:
        target_id = uuid.uuid4()
        profile_data = {
            "id": target_id,
            "username": "otheruser",
            "display_name": "Other User",
            "avatar_url": None,
            "status_text": None,
            "preferred_genres": ["fantasia"],
            "streak_current": 5,
            "streak_longest": 10,
            "total_reading_time_minutes": 120,
            "timezone": "America/Sao_Paulo",
            "is_active": True,
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
            "total_books_finished": 3,
            "badges": [],
        }
        with patch("app.api.v1.endpoints.users.get_public_profile", new_callable=AsyncMock) as mock_profile:
            mock_profile.return_value = profile_data
            resp = self.client.get(f"/api/v1/users/{target_id}/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "otheruser"
        assert data["total_books_finished"] == 3

    def test_public_profile_not_found(self) -> None:
        target_id = uuid.uuid4()
        with patch("app.api.v1.endpoints.users.get_public_profile", new_callable=AsyncMock) as mock_profile:
            mock_profile.side_effect = ProfileError("Usuário não encontrado.", status_code=404)
            resp = self.client.get(f"/api/v1/users/{target_id}/profile")
        assert resp.status_code == 404
