"""Testes para endpoints de gerenciamento de sessões."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.auth import router as auth_router
from app.services.session import SessionError


def _make_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email = overrides.get("email", "user@test.com")
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = None
    user.status_text = None
    user.auth_provider = overrides.get("auth_provider", "local")
    user.preferred_genres = ["fantasia"]
    user.onboarding_completed = True
    user.email_notifications = {}
    user.streak_current = 0
    user.streak_longest = 0
    user.streak_last_update = None
    user.total_reading_time_minutes = 0
    user.timezone = "America/Sao_Paulo"
    user.is_active = True
    user.last_login_at = None
    user.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    user.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
    user.hardcover_token_encrypted = overrides.get("hardcover_token_encrypted")
    user.auto_sync_hardcover = False
    return user


_FAKE_SESSION_DATA = {
    "id": uuid.uuid4(),
    "device_info": "Mozilla/5.0 (iPhone)",
    "ip_address": "192.168.1.*",
    "last_active_at": datetime(2026, 3, 20, tzinfo=UTC),
    "created_at": datetime(2026, 3, 19, tzinfo=UTC),
    "is_current": True,
}

app = FastAPI()
app.include_router(auth_router, prefix="/api/v1/auth")


def _override_user(user: MagicMock, current_jti: str | None = "test_jti_abc") -> None:
    from app.core.deps import get_current_active_user, get_current_refresh_jti, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_current_refresh_jti] = lambda: current_jti


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── GET /auth/sessions ────────────────────────────────────────────────────────


class TestListSessions:
    def setup_method(self) -> None:
        self.user = _make_user()
        _override_user(self.user, current_jti="test_jti_abc")
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_list_sessions_success(self) -> None:
        with patch(
            "app.api.v1.endpoints.auth.list_sessions",
            new_callable=AsyncMock,
        ) as mock_list:
            mock_list.return_value = [_FAKE_SESSION_DATA]
            resp = self.client.get("/api/v1/auth/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        assert len(data["sessions"]) == 1
        assert data["sessions"][0]["is_current"] is True
        assert data["sessions"][0]["ip_address"] == "192.168.1.*"

    def test_list_sessions_empty(self) -> None:
        with patch(
            "app.api.v1.endpoints.auth.list_sessions",
            new_callable=AsyncMock,
        ) as mock_list:
            mock_list.return_value = []
            resp = self.client.get("/api/v1/auth/sessions")
        assert resp.status_code == 200
        assert resp.json()["sessions"] == []

    def test_list_sessions_passes_jti(self) -> None:
        with patch(
            "app.api.v1.endpoints.auth.list_sessions",
            new_callable=AsyncMock,
        ) as mock_list:
            mock_list.return_value = []
            self.client.get("/api/v1/auth/sessions")
        mock_list.assert_called_once()
        call_kwargs = mock_list.call_args.kwargs
        assert call_kwargs["current_jti"] == "test_jti_abc"


# ── DELETE /auth/sessions/{session_id} ────────────────────────────────────────


class TestRevokeSession:
    def setup_method(self) -> None:
        self.user = _make_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_revoke_session_success(self) -> None:
        session_id = uuid.uuid4()
        with patch(
            "app.api.v1.endpoints.auth.revoke_session",
            new_callable=AsyncMock,
        ) as mock_revoke, patch("app.api.v1.endpoints.auth.get_redis", return_value=AsyncMock()):
            mock_revoke.return_value = None
            resp = self.client.delete(f"/api/v1/auth/sessions/{session_id}")
        assert resp.status_code == 200
        assert "revogada" in resp.json()["detail"]

    def test_revoke_session_not_found(self) -> None:
        session_id = uuid.uuid4()
        with patch(
            "app.api.v1.endpoints.auth.revoke_session",
            new_callable=AsyncMock,
        ) as mock_revoke, patch("app.api.v1.endpoints.auth.get_redis", return_value=AsyncMock()):
            mock_revoke.side_effect = SessionError(
                "Sessão não encontrada.", status_code=404
            )
            resp = self.client.delete(f"/api/v1/auth/sessions/{session_id}")
        assert resp.status_code == 404
        assert "não encontrada" in resp.json()["detail"]

    def test_revoke_session_invalid_uuid(self) -> None:
        resp = self.client.delete("/api/v1/auth/sessions/not-a-uuid")
        assert resp.status_code == 422


# ── DELETE /auth/sessions (all others) ────────────────────────────────────────


class TestRevokeAllOtherSessions:
    def setup_method(self) -> None:
        self.user = _make_user()
        _override_user(self.user, current_jti="active_jti_xyz")
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_revoke_all_others_success(self) -> None:
        with patch(
            "app.api.v1.endpoints.auth.revoke_all_other_sessions",
            new_callable=AsyncMock,
        ) as mock_revoke_all:
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=AsyncMock()):
                mock_revoke_all.return_value = 3
                resp = self.client.delete("/api/v1/auth/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 3
        assert "3" in data["detail"]

    def test_revoke_all_others_no_jti(self) -> None:
        _clear_overrides()
        # Override without a current_jti
        _override_user(self.user, current_jti=None)
        resp = self.client.delete("/api/v1/auth/sessions")
        assert resp.status_code == 400
        assert "refresh token" in resp.json()["detail"].lower()

    def test_revoke_all_others_zero_sessions(self) -> None:
        with patch(
            "app.api.v1.endpoints.auth.revoke_all_other_sessions",
            new_callable=AsyncMock,
        ) as mock_revoke_all:
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=AsyncMock()):
                mock_revoke_all.return_value = 0
                resp = self.client.delete("/api/v1/auth/sessions")
        assert resp.status_code == 200
        assert resp.json()["count"] == 0
