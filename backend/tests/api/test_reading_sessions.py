"""Testes de endpoint para /api/v1/reading-sessions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.reading_sessions import router
from app.core.deps import get_current_active_user, get_session
from app.services.reading_session import ReadingSessionError
from tests.conftest import make_user

# ── Shared fixtures ────────────────────────────────────────────────────────────

FAKE_USER = make_user()
FAKE_DB = AsyncMock()


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/reading-sessions")
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    return app


def _make_session(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.id = overrides.get("id", uuid.uuid4())
    s.user_id = overrides.get("user_id", FAKE_USER.id)
    s.round_id = overrides.get("round_id", uuid.uuid4())
    s.started_at = overrides.get("started_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    s.ended_at = overrides.get("ended_at")
    s.duration_minutes = overrides.get("duration_minutes")
    s.created_at = overrides.get("created_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    return s


# ── POST /start ───────────────────────────────────────────────────────────────


class TestStartSession:
    def test_start_session_success(self) -> None:
        round_id = uuid.uuid4()
        session = _make_session(round_id=round_id)
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.start_session",
            new=AsyncMock(return_value=session),
        ):
            response = client.post(
                "/api/v1/reading-sessions/start",
                json={"round_id": str(round_id)},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["round_id"] == str(round_id)
        assert data["ended_at"] is None

    def test_start_session_invalid_round_id_returns_422(self) -> None:
        app = _make_app()
        client = TestClient(app)

        response = client.post(
            "/api/v1/reading-sessions/start",
            json={"round_id": "not-a-uuid"},
        )

        assert response.status_code == 422

    def test_start_session_already_active_returns_409(self) -> None:
        round_id = uuid.uuid4()
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.start_session",
            new=AsyncMock(side_effect=ReadingSessionError("Sessão já ativa.", status_code=409)),
        ):
            response = client.post(
                "/api/v1/reading-sessions/start",
                json={"round_id": str(round_id)},
            )

        assert response.status_code == 409
        assert "ativa" in response.json()["detail"]

    def test_start_session_wrong_status_returns_409(self) -> None:
        round_id = uuid.uuid4()
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.start_session",
            new=AsyncMock(side_effect=ReadingSessionError("A rodada não está em fase de leitura.", status_code=409)),
        ):
            response = client.post(
                "/api/v1/reading-sessions/start",
                json={"round_id": str(round_id)},
            )

        assert response.status_code == 409


# ── POST /{session_id}/stop ───────────────────────────────────────────────────


class TestStopSession:
    def test_stop_session_success(self) -> None:
        session_id = uuid.uuid4()
        ended_session = _make_session(
            ended_at=datetime(2026, 3, 19, 10, 30, 0, tzinfo=UTC),
            duration_minutes=30,
        )
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.stop_session",
            new=AsyncMock(return_value=ended_session),
        ):
            response = client.post(
                f"/api/v1/reading-sessions/{session_id}/stop",
                json={},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["duration_minutes"] == 30
        assert data["ended_at"] is not None

    def test_stop_session_with_override(self) -> None:
        session_id = uuid.uuid4()
        ended_session = _make_session(
            ended_at=datetime(2026, 3, 19, 10, 45, 0, tzinfo=UTC),
            duration_minutes=45,
        )
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.stop_session",
            new=AsyncMock(return_value=ended_session),
        ) as mock_stop:
            response = client.post(
                f"/api/v1/reading-sessions/{session_id}/stop",
                json={"duration_override_minutes": 45},
            )

        assert response.status_code == 200
        call_kwargs = mock_stop.call_args[1]
        assert call_kwargs["duration_override_minutes"] == 45

    def test_stop_session_not_found_returns_404(self) -> None:
        session_id = uuid.uuid4()
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.stop_session",
            new=AsyncMock(side_effect=ReadingSessionError("Sessão não encontrada.", status_code=404)),
        ):
            response = client.post(
                f"/api/v1/reading-sessions/{session_id}/stop",
                json={},
            )

        assert response.status_code == 404

    def test_stop_session_already_ended_returns_409(self) -> None:
        session_id = uuid.uuid4()
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.stop_session",
            new=AsyncMock(side_effect=ReadingSessionError("Sessão já encerrada.", status_code=409)),
        ):
            response = client.post(
                f"/api/v1/reading-sessions/{session_id}/stop",
                json={},
            )

        assert response.status_code == 409


# ── GET /me ───────────────────────────────────────────────────────────────────


class TestListSessions:
    def test_list_sessions_empty(self) -> None:
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.list_my_sessions",
            new=AsyncMock(return_value=([], 0, None)),
        ):
            response = client.get("/api/v1/reading-sessions/me")

        assert response.status_code == 200
        data = response.json()
        assert data["sessions"] == []
        assert data["total_duration_minutes"] == 0
        assert data["next_cursor"] is None

    def test_list_sessions_with_results(self) -> None:
        session = _make_session(duration_minutes=30)
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.list_my_sessions",
            new=AsyncMock(return_value=([session], 30, None)),
        ):
            response = client.get("/api/v1/reading-sessions/me")

        assert response.status_code == 200
        data = response.json()
        assert len(data["sessions"]) == 1
        assert data["total_duration_minutes"] == 30

    def test_list_sessions_with_next_cursor(self) -> None:
        session = _make_session()
        cursor = "2026-03-19T10:00:00"
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.list_my_sessions",
            new=AsyncMock(return_value=([session], 0, cursor)),
        ):
            response = client.get("/api/v1/reading-sessions/me")

        assert response.status_code == 200
        data = response.json()
        assert data["next_cursor"] == cursor

    def test_list_sessions_passes_round_id_filter(self) -> None:
        round_id = uuid.uuid4()
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.reading_sessions.list_my_sessions",
            new=AsyncMock(return_value=([], 0, None)),
        ) as mock_list:
            client.get(f"/api/v1/reading-sessions/me?round_id={round_id}")

        call_kwargs = mock_list.call_args[1]
        assert call_kwargs["round_id"] == round_id
