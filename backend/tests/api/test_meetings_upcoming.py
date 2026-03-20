"""Testes para GET /meetings/upcoming."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.meetings import meetings_router

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(meetings_router, prefix="/api/v1/meetings")


def _mock_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = "testuser"
    user.display_name = "Test User"
    return user


def _mock_meeting(
    user_id: uuid.UUID,
    group_id: uuid.UUID | None = None,
    group_name: str = "Clube Literário",
    scheduled_at: datetime | None = None,
) -> MagicMock:
    meeting = MagicMock()
    meeting.id = uuid.uuid4()
    meeting.group_id = group_id or uuid.uuid4()
    meeting.title = "Encontro mensal"
    meeting.scheduled_at = scheduled_at or (datetime.now(UTC) + timedelta(days=7))
    meeting.duration_minutes = 60
    meeting.meeting_type = "in_person"
    meeting.rsvps = []

    group = MagicMock()
    group.name = group_name
    group.photo_url = None
    meeting.group = group
    return meeting


def _override_deps(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session():
        yield AsyncMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_deps() -> None:
    app.dependency_overrides.clear()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestUpcomingMeetings:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.list_upcoming_meetings")
    def test_returns_upcoming_meetings(self, mock_list: MagicMock) -> None:
        meeting = _mock_meeting(self.user.id)
        mock_list.return_value = [meeting]

        response = self.client.get("/api/v1/meetings/upcoming")
        assert response.status_code == 200
        data = response.json()
        assert len(data["meetings"]) == 1
        assert data["meetings"][0]["title"] == "Encontro mensal"

    @patch("app.api.v1.endpoints.meetings.list_upcoming_meetings")
    def test_returns_empty_list(self, mock_list: MagicMock) -> None:
        mock_list.return_value = []

        response = self.client.get("/api/v1/meetings/upcoming")
        assert response.status_code == 200
        assert response.json()["meetings"] == []

    @patch("app.api.v1.endpoints.meetings.list_upcoming_meetings")
    def test_limit_param_passed(self, mock_list: MagicMock) -> None:
        mock_list.return_value = []

        self.client.get("/api/v1/meetings/upcoming?limit=5")
        mock_list.assert_awaited_once()
        _, kwargs = mock_list.call_args
        assert kwargs.get("limit") == 5

    @patch("app.api.v1.endpoints.meetings.list_upcoming_meetings")
    def test_cross_group_meetings_included(self, mock_list: MagicMock) -> None:
        g1 = uuid.uuid4()
        g2 = uuid.uuid4()
        meetings = [
            _mock_meeting(self.user.id, group_id=g1, group_name="Clube A"),
            _mock_meeting(self.user.id, group_id=g2, group_name="Clube B"),
        ]
        mock_list.return_value = meetings

        response = self.client.get("/api/v1/meetings/upcoming")
        data = response.json()
        assert len(data["meetings"]) == 2
        group_names = {m["group_name"] for m in data["meetings"]}
        assert group_names == {"Clube A", "Clube B"}

    def test_unauthenticated_returns_error(self) -> None:
        _clear_deps()
        response = self.client.get("/api/v1/meetings/upcoming")
        assert response.status_code in (401, 403, 422)
