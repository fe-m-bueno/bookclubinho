"""Testes unitários para app.api.v1.endpoints.wrapped."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.wrapped import wrapped_group_router

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(wrapped_group_router, prefix="/api/v1/groups/{group_id}/wrapped")

GROUP_ID = str(uuid.uuid4())
YEAR = 2025


def _mock_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.is_active = True
    return user


def _mock_member() -> MagicMock:
    member = MagicMock()
    member.user_id = uuid.uuid4()
    return member


def _make_wrapped_result(
    group_id: str = GROUP_ID,
    year: int = YEAR,
) -> dict:
    return {
        "group_id": group_id,
        "year": year,
        "data": {
            "year": year,
            "group_name": "Clube dos Leitores",
            "group_photo_url": None,
            "total_books_read": 3,
            "total_pages": 900,
            "total_reading_hours": 12.5,
            "genre_breakdown": [{"genre": "ficção", "count": 3, "percentage": 100.0}],
            "highest_rated_book": None,
            "most_active_member": None,
            "longest_streak_member": None,
            "funniest_oneliner": None,
            "most_emotional_book": None,
            "member_superlatives": [],
            "emotional_stats": {
                "total_reviews": 3,
                "cried_count": 1,
                "loved_it_count": 2,
                "felt_aroused_count": 0,
                "found_heavy_count": 1,
                "wants_more_count": 3,
            },
            "member_avatars": [],
        },
        "generated_at": datetime(2025, 12, 31, tzinfo=UTC),
        "generated_by": str(uuid.uuid4()),
    }


def _override_deps(user: MagicMock, member: MagicMock | None = None) -> None:
    from app.core.deps import get_current_active_user, get_group_membership, get_session

    async def fake_session() -> AsyncGenerator[AsyncMock, None]:
        yield AsyncMock()

    if member is None:
        member = _mock_member()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_group_membership] = lambda: member


def _clear_deps() -> None:
    app.dependency_overrides.clear()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestGetWrapped:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    def test_get_requires_auth(self) -> None:
        """Sem autenticação, deve retornar 401."""
        _clear_deps()
        # Override only session and membership — no user
        from app.core.deps import get_current_active_user, get_group_membership, get_session

        async def fake_session() -> AsyncGenerator[AsyncMock, None]:
            yield AsyncMock()

        from fastapi import HTTPException

        def raise_401() -> None:
            raise HTTPException(status_code=401, detail="Não autenticado.")

        app.dependency_overrides[get_session] = fake_session
        app.dependency_overrides[get_current_active_user] = raise_401
        app.dependency_overrides[get_group_membership] = lambda: _mock_member()

        response = self.client.get(f"/api/v1/groups/{GROUP_ID}/wrapped/{YEAR}")
        assert response.status_code == 401

    @patch("app.api.v1.endpoints.wrapped.get_wrapped")
    def test_get_not_generated(self, mock_get: MagicMock) -> None:
        """Wrapped não gerado deve retornar 404."""
        from app.services.wrapped import WrappedError

        mock_get.side_effect = WrappedError(f"Wrapped {YEAR} ainda não foi gerado para este grupo.", status_code=404)

        response = self.client.get(f"/api/v1/groups/{GROUP_ID}/wrapped/{YEAR}")

        assert response.status_code == 404
        assert str(YEAR) in response.json()["detail"]

    @patch("app.api.v1.endpoints.wrapped.get_wrapped")
    def test_get_success(self, mock_get: MagicMock) -> None:
        """Wrapped existente deve retornar 200 com dados corretos."""
        result = _make_wrapped_result(group_id=GROUP_ID, year=YEAR)
        mock_get.return_value = result

        response = self.client.get(f"/api/v1/groups/{GROUP_ID}/wrapped/{YEAR}")

        assert response.status_code == 200
        data = response.json()
        assert data["year"] == YEAR
        assert data["group_id"] == GROUP_ID
        assert data["data"]["total_books_read"] == 3
        assert data["data"]["group_name"] == "Clube dos Leitores"

    def test_get_invalid_year_too_old(self) -> None:
        """Ano anterior a 2020 deve retornar 400."""
        response = self.client.get(f"/api/v1/groups/{GROUP_ID}/wrapped/2019")
        assert response.status_code == 400
        assert "2019" in response.json()["detail"]

    def test_get_invalid_year_future(self) -> None:
        """Ano no futuro deve retornar 400."""
        future_year = datetime.now().year + 1
        response = self.client.get(f"/api/v1/groups/{GROUP_ID}/wrapped/{future_year}")
        assert response.status_code == 400


class TestPostWrapped:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.wrapped.generate_wrapped")
    def test_post_generates(self, mock_generate: MagicMock) -> None:
        """POST deve gerar o wrapped e retornar 200 com dados corretos."""
        result = _make_wrapped_result(group_id=GROUP_ID, year=YEAR)
        mock_generate.return_value = result

        response = self.client.post(f"/api/v1/groups/{GROUP_ID}/wrapped/{YEAR}")

        assert response.status_code == 200
        data = response.json()
        assert data["year"] == YEAR
        assert data["group_id"] == GROUP_ID
        assert data["data"]["total_books_read"] == 3

    def test_post_invalid_year(self) -> None:
        """Ano inválido no POST deve retornar 400."""
        response = self.client.post(f"/api/v1/groups/{GROUP_ID}/wrapped/2019")
        assert response.status_code == 400
        assert "2019" in response.json()["detail"]

    @patch("app.api.v1.endpoints.wrapped.generate_wrapped")
    def test_post_service_error_propagates(self, mock_generate: MagicMock) -> None:
        """WrappedError do serviço deve ser convertida para HTTP error correto."""
        from app.services.wrapped import WrappedError

        mock_generate.side_effect = WrappedError("Erro interno.", status_code=500)

        response = self.client.post(f"/api/v1/groups/{GROUP_ID}/wrapped/{YEAR}")

        assert response.status_code == 500
        assert "Erro interno." in response.json()["detail"]
