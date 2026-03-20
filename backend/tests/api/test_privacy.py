"""Testes para endpoints de privacidade (data-export e account deletion)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.users import router as users_router
from app.services.account_deletion import AccountDeletionError
from app.services.data_export import DataExportError


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
    user.hardcover_token_encrypted = overrides.get("hardcover_token_encrypted", None)
    user.auto_sync_hardcover = overrides.get("auto_sync_hardcover", False)
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


# ── POST /me/data-export ──────────────────────────────────────────────────────


class TestDataExport:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_data_export_success(self) -> None:
        cooldown = datetime(2026, 3, 21, tzinfo=UTC)
        with patch(
            "app.api.v1.endpoints.users.request_data_export",
            new_callable=AsyncMock,
        ) as mock_export:
            with patch("app.api.v1.endpoints.users.get_redis", return_value=MagicMock()):
                mock_export.return_value = {
                    "message": "Exportação solicitada. Você receberá um link por e-mail em breve.",
                    "cooldown_until": cooldown,
                }
                resp = self.client.post("/api/v1/users/me/data-export")
        assert resp.status_code == 200
        data = resp.json()
        assert "Exportação" in data["message"]
        assert data["cooldown_until"] is not None

    def test_data_export_on_cooldown(self) -> None:
        cooldown = datetime(2026, 3, 21, tzinfo=UTC)
        with patch(
            "app.api.v1.endpoints.users.request_data_export",
            new_callable=AsyncMock,
        ) as mock_export:
            with patch("app.api.v1.endpoints.users.get_redis", return_value=MagicMock()):
                mock_export.return_value = {
                    "message": "Você já solicitou uma exportação recentemente. Aguarde o período de espera.",
                    "cooldown_until": cooldown,
                }
                resp = self.client.post("/api/v1/users/me/data-export")
        assert resp.status_code == 200
        data = resp.json()
        assert "recentemente" in data["message"]


# ── DELETE /me/account ────────────────────────────────────────────────────────


class TestDeleteAccount:
    def setup_method(self) -> None:
        self.user = _make_full_user()
        _override_user(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_overrides()

    def test_delete_account_success(self) -> None:
        import json as json_mod

        with patch(
            "app.api.v1.endpoints.users.delete_account",
            new_callable=AsyncMock,
        ) as mock_delete:
            with patch("app.api.v1.endpoints.users.get_redis", return_value=MagicMock()):
                mock_delete.return_value = None
                resp = self.client.request(
                    "DELETE",
                    "/api/v1/users/me/account",
                    content=json_mod.dumps(
                        {"confirmation": "EXCLUIR", "current_password": "mypassword123"}
                    ),
                    headers={"Content-Type": "application/json"},
                )
        assert resp.status_code == 204

    def test_delete_account_wrong_confirmation(self) -> None:
        import json as json_mod

        resp = self.client.request(
            "DELETE",
            "/api/v1/users/me/account",
            content=json_mod.dumps(
                {"confirmation": "delete", "current_password": "mypassword123"}
            ),
            headers={"Content-Type": "application/json"},
        )
        # Pydantic validator rejects invalid confirmation
        assert resp.status_code == 422

    def test_delete_account_wrong_password(self) -> None:
        import json as json_mod

        with patch(
            "app.api.v1.endpoints.users.delete_account",
            new_callable=AsyncMock,
        ) as mock_delete:
            with patch("app.api.v1.endpoints.users.get_redis", return_value=MagicMock()):
                mock_delete.side_effect = AccountDeletionError(
                    "Senha incorreta.", status_code=400
                )
                resp = self.client.request(
                    "DELETE",
                    "/api/v1/users/me/account",
                    content=json_mod.dumps(
                        {"confirmation": "EXCLUIR", "current_password": "wrongpassword"}
                    ),
                    headers={"Content-Type": "application/json"},
                )
        assert resp.status_code == 400
        assert "Senha" in resp.json()["detail"]

    def test_delete_account_missing_password_local(self) -> None:
        import json as json_mod

        with patch(
            "app.api.v1.endpoints.users.delete_account",
            new_callable=AsyncMock,
        ) as mock_delete:
            with patch("app.api.v1.endpoints.users.get_redis", return_value=MagicMock()):
                mock_delete.side_effect = AccountDeletionError(
                    "Informe sua senha para confirmar a exclusão.", status_code=400
                )
                resp = self.client.request(
                    "DELETE",
                    "/api/v1/users/me/account",
                    content=json_mod.dumps({"confirmation": "EXCLUIR"}),
                    headers={"Content-Type": "application/json"},
                )
        assert resp.status_code == 400

    def test_delete_account_missing_body(self) -> None:
        import json as json_mod

        resp = self.client.request(
            "DELETE",
            "/api/v1/users/me/account",
            content=json_mod.dumps({}),
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 422
