"""Testes para endpoints de conta (PATCH /password, /email, GET /email/confirm)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.auth import router as auth_router
from app.services.account import AccountError


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
    return user


app = FastAPI()
app.include_router(auth_router, prefix="/api/v1/auth")


def _override_user(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── PATCH /auth/password ──────────────────────────────────────────────────────


class TestChangePassword:
    def setup_method(self) -> None:
        self.user = _make_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_change_password_success(self) -> None:
        with patch("app.api.v1.endpoints.auth.change_password", new_callable=AsyncMock) as mock_cp:
            mock_cp.return_value = None
            resp = self.client.patch(
                "/api/v1/auth/password",
                json={"current_password": "oldpass1", "new_password": "newpass1234"},
            )
        assert resp.status_code == 200
        assert "Senha alterada" in resp.json()["message"]

    def test_change_password_wrong_current(self) -> None:
        with patch("app.api.v1.endpoints.auth.change_password", new_callable=AsyncMock) as mock_cp:
            mock_cp.side_effect = AccountError("Senha atual incorreta.", status_code=400)
            resp = self.client.patch(
                "/api/v1/auth/password",
                json={"current_password": "wrong", "new_password": "newpass1234"},
            )
        assert resp.status_code == 400

    def test_change_password_non_local(self) -> None:
        with patch("app.api.v1.endpoints.auth.change_password", new_callable=AsyncMock) as mock_cp:
            mock_cp.side_effect = AccountError("Esta conta não usa senha.", status_code=403)
            resp = self.client.patch(
                "/api/v1/auth/password",
                json={"current_password": "x", "new_password": "newpass1234"},
            )
        assert resp.status_code == 403

    def test_change_password_too_short(self) -> None:
        resp = self.client.patch(
            "/api/v1/auth/password",
            json={"current_password": "oldpass", "new_password": "short"},
        )
        assert resp.status_code == 422


# ── PATCH /auth/email ─────────────────────────────────────────────────────────


class TestChangeEmail:
    def setup_method(self) -> None:
        self.user = _make_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_change_email_success(self) -> None:
        with patch("app.api.v1.endpoints.auth.initiate_email_change", new_callable=AsyncMock) as mock_ie:
            mock_ie.return_value = None
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=MagicMock()):
                resp = self.client.patch(
                    "/api/v1/auth/email",
                    json={"new_email": "new@example.com", "current_password": "pass1234"},
                )
        assert resp.status_code == 200
        assert "new@example.com" in resp.json()["message"]

    def test_change_email_already_taken(self) -> None:
        with patch("app.api.v1.endpoints.auth.initiate_email_change", new_callable=AsyncMock) as mock_ie:
            mock_ie.side_effect = AccountError("E-mail já está em uso.", status_code=409)
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=MagicMock()):
                resp = self.client.patch(
                    "/api/v1/auth/email",
                    json={"new_email": "taken@example.com"},
                )
        assert resp.status_code == 409


# ── GET /auth/email/confirm ───────────────────────────────────────────────────


class TestConfirmEmail:
    def setup_method(self) -> None:
        _clear_overrides()
        from app.core.deps import get_session

        async def fake_session():
            yield MagicMock()

        app.dependency_overrides[get_session] = fake_session
        self.client = TestClient(app, raise_server_exceptions=False, follow_redirects=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_confirm_email_valid_token(self) -> None:
        with patch("app.api.v1.endpoints.auth.confirm_email_change", new_callable=AsyncMock) as mock_ce:
            mock_ce.return_value = None
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=MagicMock()):
                resp = self.client.get("/api/v1/auth/email/confirm?token=validtoken123")
        assert resp.status_code == 303
        assert "email_changed=true" in resp.headers["location"]

    def test_confirm_email_invalid_token(self) -> None:
        with patch("app.api.v1.endpoints.auth.confirm_email_change", new_callable=AsyncMock) as mock_ce:
            mock_ce.side_effect = AccountError("Token inválido ou expirado.", status_code=400)
            with patch("app.api.v1.endpoints.auth.get_redis", return_value=MagicMock()):
                resp = self.client.get("/api/v1/auth/email/confirm?token=badtoken")
        assert resp.status_code == 303
        assert "email_error=true" in resp.headers["location"]
