"""Testes unitários para os endpoints de users."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.users import router as users_router
from tests.conftest import mock_db_returning

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(users_router, prefix="/api/v1/users")


def _make_full_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email = overrides.get("email", "user@test.com")
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.status_text = overrides.get("status_text")
    user.auth_provider = overrides.get("auth_provider", "local")
    user.preferred_genres = overrides.get("preferred_genres", [])
    user.onboarding_completed = overrides.get("onboarding_completed", True)
    user.email_notifications = overrides.get("email_notifications", {})
    user.streak_current = overrides.get("streak_current", 0)
    user.streak_longest = overrides.get("streak_longest", 0)
    user.streak_last_update = overrides.get("streak_last_update")
    user.total_reading_time_minutes = overrides.get("total_reading_time_minutes", 0)
    user.timezone = overrides.get("timezone", "America/Sao_Paulo")
    user.is_active = overrides.get("is_active", True)
    user.last_login_at = overrides.get("last_login_at")
    user.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    user.updated_at = overrides.get("updated_at", datetime(2026, 1, 1, tzinfo=UTC))
    user.auto_sync_hardcover = overrides.get("auto_sync_hardcover", False)
    user.hardcover_token_encrypted = overrides.get("hardcover_token_encrypted")
    return user


def _override_user(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── Endpoint: GET /users/me ────────────────────────────────────────────────


class TestGetMe:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_get_me_returns_user_data(self) -> None:
        response = self.client.get("/api/v1/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["email"] == "user@test.com"
        assert data["timezone"] == "America/Sao_Paulo"

    def test_get_me_unauthenticated(self) -> None:
        _clear_overrides()
        # No dependency override → no current user → 401/403
        response = self.client.get("/api/v1/users/me")
        assert response.status_code in (401, 403, 422)


# ── Endpoint: GET /users/check-username/{username} ──────────────────────────


class TestCheckUsernameEndpoint:
    @pytest.mark.asyncio
    async def test_available_username(self) -> None:
        from app.services.onboarding import check_username_available

        mock_db = mock_db_returning(None)  # no user found = available
        result = await check_username_available(db=mock_db, username="newuser")
        assert result is True

    @pytest.mark.asyncio
    async def test_taken_username(self) -> None:
        from app.services.onboarding import check_username_available

        existing = MagicMock()
        mock_db = mock_db_returning(existing)  # user found = taken
        result = await check_username_available(db=mock_db, username="takenuser")
        assert result is False
