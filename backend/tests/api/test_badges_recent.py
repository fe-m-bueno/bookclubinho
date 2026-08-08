"""Testes para GET /users/me/badges/recent."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.badges import badges_user_router

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(badges_user_router, prefix="/api/v1/users")


def _mock_user() -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.username = "testuser"
    return user


def _mock_badge(slug: str = "bookworm") -> dict:
    return {
        "slug": slug,
        "name": "Bookworm",
        "description": "Leu 5 livros",
        "emoji": "📚",
        "category": "reading",
        "earned_at": datetime(2026, 3, 1, tzinfo=UTC),
        "group_name": None,
        "book_title": None,
    }


def _override_deps(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield AsyncMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_deps() -> None:
    app.dependency_overrides.clear()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestRecentBadges:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.badges.get_recent_badges")
    def test_returns_recent_badges(self, mock_fn: MagicMock) -> None:
        mock_fn.return_value = [_mock_badge("bookworm"), _mock_badge("founder")]

        response = self.client.get("/api/v1/users/me/badges/recent")
        assert response.status_code == 200
        data = response.json()
        assert len(data["badges"]) == 2
        assert data["badges"][0]["slug"] == "bookworm"

    @patch("app.api.v1.endpoints.badges.get_recent_badges")
    def test_empty_list(self, mock_fn: MagicMock) -> None:
        mock_fn.return_value = []

        response = self.client.get("/api/v1/users/me/badges/recent")
        assert response.status_code == 200
        assert response.json()["badges"] == []

    @patch("app.api.v1.endpoints.badges.get_recent_badges")
    def test_limit_param(self, mock_fn: MagicMock) -> None:
        mock_fn.return_value = []

        self.client.get("/api/v1/users/me/badges/recent?limit=5")
        mock_fn.assert_awaited_once()
        _, kwargs = mock_fn.call_args
        assert kwargs.get("limit") == 5

    @patch("app.api.v1.endpoints.badges.get_recent_badges")
    def test_within_days_param(self, mock_fn: MagicMock) -> None:
        """A home pede uma janela para que conquista volte a ser evento.

        Sem janela o endpoint devolve as últimas N de qualquer época, que é
        como a seção "conquistas" virou móvel fixo mostrando "Fundador · há 5
        meses" para sempre.
        """
        mock_fn.return_value = []

        self.client.get("/api/v1/users/me/badges/recent?within_days=7")
        mock_fn.assert_awaited_once()
        _, kwargs = mock_fn.call_args
        assert kwargs.get("within_days") == 7

    @patch("app.api.v1.endpoints.badges.get_recent_badges")
    def test_within_days_is_optional(self, mock_fn: MagicMock) -> None:
        # O perfil e /badges continuam querendo as últimas de qualquer época.
        mock_fn.return_value = []

        self.client.get("/api/v1/users/me/badges/recent")
        _, kwargs = mock_fn.call_args
        assert kwargs.get("within_days") is None

    def test_unauthenticated(self) -> None:
        _clear_deps()
        response = self.client.get("/api/v1/users/me/badges/recent")
        assert response.status_code in (401, 403, 422)
