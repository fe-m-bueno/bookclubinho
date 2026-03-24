"""Testes para endpoints de integração Hardcover."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.integrations import router as integrations_router
from app.services.integration import IntegrationError


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


app = FastAPI()
app.include_router(integrations_router, prefix="/api/v1/integrations")


def _override_user(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield MagicMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_overrides() -> None:
    app.dependency_overrides.clear()


# ── POST /hardcover ────────────────────────────────────────────────────────────


class TestConnectHardcover:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_connect_success(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.connect_hardcover",
            new_callable=AsyncMock,
        ) as mock_connect:
            mock_connect.return_value = "bookworm42"
            resp = self.client.post(
                "/api/v1/integrations/hardcover",
                json={"token": "hc_token_abc123"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is True
        assert data["hardcover_username"] == "bookworm42"

    def test_connect_invalid_token(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.connect_hardcover",
            new_callable=AsyncMock,
        ) as mock_connect:
            mock_connect.side_effect = IntegrationError("Token Hardcover inválido.", status_code=400)
            resp = self.client.post(
                "/api/v1/integrations/hardcover",
                json={"token": "bad_token"},
            )
        assert resp.status_code == 400
        assert "inválido" in resp.json()["detail"]

    def test_connect_missing_token(self) -> None:
        resp = self.client.post("/api/v1/integrations/hardcover", json={})
        assert resp.status_code == 422


# ── DELETE /hardcover ─────────────────────────────────────────────────────────


class TestDisconnectHardcover:
    def setup_method(self) -> None:
        self.user = _make_full_user(hardcover_token_encrypted="enc_token")
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_disconnect_success(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.disconnect_hardcover",
            new_callable=AsyncMock,
        ) as mock_dc:
            mock_dc.return_value = None
            resp = self.client.delete("/api/v1/integrations/hardcover")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is False
        mock_dc.assert_called_once()


# ── GET /hardcover/status ─────────────────────────────────────────────────────


class TestHardcoverStatus:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_status_connected(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.get_hardcover_status",
            new_callable=AsyncMock,
        ) as mock_status:
            mock_status.return_value = {
                "connected": True,
                "hardcover_username": "reader99",
            }
            resp = self.client.get("/api/v1/integrations/hardcover/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is True
        assert data["hardcover_username"] == "reader99"

    def test_status_not_connected(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.get_hardcover_status",
            new_callable=AsyncMock,
        ) as mock_status:
            mock_status.return_value = {
                "connected": False,
                "hardcover_username": None,
            }
            resp = self.client.get("/api/v1/integrations/hardcover/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connected"] is False
        assert data["hardcover_username"] is None


# ── PATCH /hardcover/sync ─────────────────────────────────────────────────────


class TestToggleAutoSync:
    def setup_method(self) -> None:
        self.user = _make_full_user(hardcover_token_encrypted="enc_token")
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_toggle_sync_enable_success(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.toggle_auto_sync",
            new_callable=AsyncMock,
        ) as mock_toggle:
            mock_toggle.return_value = None
            self.user.auto_sync_hardcover = True
            resp = self.client.patch(
                "/api/v1/integrations/hardcover/sync",
                json={"auto_sync_hardcover": True},
            )
        assert resp.status_code == 200
        mock_toggle.assert_called_once()

    def test_toggle_sync_no_connection(self) -> None:
        with patch(
            "app.api.v1.endpoints.integrations.toggle_auto_sync",
            new_callable=AsyncMock,
        ) as mock_toggle:
            mock_toggle.side_effect = IntegrationError(
                "Conecte o Hardcover antes de ativar a sincronização.", status_code=400
            )
            resp = self.client.patch(
                "/api/v1/integrations/hardcover/sync",
                json={"auto_sync_hardcover": True},
            )
        assert resp.status_code == 400
        assert "Conecte" in resp.json()["detail"]

    def test_toggle_sync_missing_body(self) -> None:
        resp = self.client.patch("/api/v1/integrations/hardcover/sync", json={})
        assert resp.status_code == 422
