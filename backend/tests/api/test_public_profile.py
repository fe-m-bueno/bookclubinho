"""Testes para endpoints de perfil público por username e grupos em comum."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.users import router as users_router
from app.services.user_profile import ProfileError


def _make_full_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email = overrides.get("email", "user@test.com")
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.status_text = overrides.get("status_text")
    user.auth_provider = overrides.get("auth_provider", "local")
    user.preferred_genres = overrides.get("preferred_genres", ["fantasia"])
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
    user.hardcover_token_encrypted = overrides.get("hardcover_token_encrypted")
    user.auto_sync_hardcover = overrides.get("auto_sync_hardcover", False)
    return user


_BASE_PROFILE = {
    "id": uuid.uuid4(),
    "username": "bookworm42",
    "display_name": "Bookworm",
    "avatar_url": None,
    "status_text": None,
    "preferred_genres": ["fantasia"],
    "streak_current": 7,
    "streak_longest": 30,
    "total_reading_time_minutes": 360,
    "timezone": "America/Sao_Paulo",
    "is_active": True,
    "created_at": datetime(2026, 1, 1, tzinfo=UTC),
    "total_books_finished": 5,
    "badges": [],
    "shared_group_count": 0,
}

app = FastAPI()
app.include_router(users_router, prefix="/api/v1/users")


def _override_user(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_optional_user, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_optional_user] = lambda: user


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── GET /by-username/{username}/profile ───────────────────────────────────────


class TestGetProfileByUsername:
    def setup_method(self) -> None:
        self.viewer = _make_full_user()
        _override_user(self.viewer)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_profile_by_username_success(self) -> None:
        profile_data = dict(_BASE_PROFILE, shared_group_count=2)
        with patch(
            "app.api.v1.endpoints.users.get_public_profile_by_username",
            new_callable=AsyncMock,
        ) as mock_profile:
            mock_profile.return_value = profile_data
            resp = self.client.get("/api/v1/users/by-username/bookworm42/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "bookworm42"
        assert data["shared_group_count"] == 2
        assert data["total_books_finished"] == 5

    def test_profile_by_username_not_found(self) -> None:
        with patch(
            "app.api.v1.endpoints.users.get_public_profile_by_username",
            new_callable=AsyncMock,
        ) as mock_profile:
            mock_profile.side_effect = ProfileError("Usuário não encontrado.", status_code=404)
            resp = self.client.get("/api/v1/users/by-username/ghostuser/profile")
        assert resp.status_code == 404
        assert "não encontrado" in resp.json()["detail"]

    def test_profile_by_username_viewer_passed(self) -> None:
        with patch(
            "app.api.v1.endpoints.users.get_public_profile_by_username",
            new_callable=AsyncMock,
        ) as mock_profile:
            mock_profile.return_value = dict(_BASE_PROFILE)
            self.client.get("/api/v1/users/by-username/bookworm42/profile")
        mock_profile.assert_called_once()
        call_kwargs = mock_profile.call_args.kwargs
        assert call_kwargs["viewer_id"] == self.viewer.id

    def test_profile_by_username_anonymous_viewer(self) -> None:
        # Override with no user (anonymous)
        from app.core.deps import get_optional_user

        app.dependency_overrides[get_optional_user] = lambda: None

        with patch(
            "app.api.v1.endpoints.users.get_public_profile_by_username",
            new_callable=AsyncMock,
        ) as mock_profile:
            mock_profile.return_value = dict(_BASE_PROFILE)
            resp = self.client.get("/api/v1/users/by-username/bookworm42/profile")
        assert resp.status_code == 200
        call_kwargs = mock_profile.call_args.kwargs
        assert call_kwargs["viewer_id"] is None


# ── GET /by-username/{username}/shared-groups ─────────────────────────────────


class TestGetSharedGroups:
    def setup_method(self) -> None:
        self.viewer = _make_full_user()
        _override_user(self.viewer)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_shared_groups_success(self) -> None:
        target_id = uuid.uuid4()
        mock_target = MagicMock()
        mock_target.id = target_id
        mock_target.username = "bookworm42"
        mock_target.is_active = True

        shared = [
            {
                "id": uuid.uuid4(),
                "name": "Clube Fantasia",
                "photo_url": None,
                "member_count": 4,
            }
        ]

        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = mock_target
        db_mock = AsyncMock()
        db_mock.execute = AsyncMock(return_value=db_result)

        from app.core.deps import get_session

        async def fake_session():
            yield db_mock

        app.dependency_overrides[get_session] = fake_session

        with patch(
            "app.api.v1.endpoints.users.get_shared_groups",
            new_callable=AsyncMock,
        ) as mock_shared:
            mock_shared.return_value = shared
            resp = self.client.get("/api/v1/users/by-username/bookworm42/shared-groups")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Clube Fantasia"
        assert data[0]["member_count"] == 4

    def test_shared_groups_target_not_found(self) -> None:
        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = None
        db_mock = AsyncMock()
        db_mock.execute = AsyncMock(return_value=db_result)

        from app.core.deps import get_session

        async def fake_session():
            yield db_mock

        app.dependency_overrides[get_session] = fake_session

        resp = self.client.get("/api/v1/users/by-username/ghostuser/shared-groups")
        assert resp.status_code == 404

    def test_shared_groups_empty(self) -> None:
        target_id = uuid.uuid4()
        mock_target = MagicMock()
        mock_target.id = target_id
        mock_target.username = "bookworm42"
        mock_target.is_active = True

        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = mock_target
        db_mock = AsyncMock()
        db_mock.execute = AsyncMock(return_value=db_result)

        from app.core.deps import get_session

        async def fake_session():
            yield db_mock

        app.dependency_overrides[get_session] = fake_session

        with patch(
            "app.api.v1.endpoints.users.get_shared_groups",
            new_callable=AsyncMock,
        ) as mock_shared:
            mock_shared.return_value = []
            resp = self.client.get("/api/v1/users/by-username/bookworm42/shared-groups")
        assert resp.status_code == 200
        assert resp.json() == []
