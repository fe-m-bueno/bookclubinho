"""Testes unitários para app.api.v1.endpoints.meetings."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.meetings import group_meetings_router, meetings_router
from app.db.models.group import GroupMember, GroupRole

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(
    group_meetings_router, prefix="/api/v1/groups/{group_id}/meetings"
)
app.include_router(meetings_router, prefix="/api/v1/meetings")


def _mock_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.is_active = True
    return user


def _mock_member(**overrides: object) -> MagicMock:
    m = MagicMock(spec=GroupMember)
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.role = overrides.get("role", GroupRole.MEMBER)
    return m


def _mock_meeting(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.id = overrides.get("id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.round_id = None
    m.title = overrides.get("title", "Test Meeting")
    m.description = None
    m.location = "Café"
    m.meeting_type = "in_person"
    m.virtual_link = None
    m.scheduled_at = overrides.get(
        "scheduled_at", datetime.now(UTC) + timedelta(days=7)
    )
    m.duration_minutes = 60
    m.created_by = overrides.get("created_by", uuid.uuid4())
    m.created_at = datetime.now(UTC)
    m.updated_at = datetime.now(UTC)
    m.rsvps = overrides.get("rsvps", [])

    creator = MagicMock()
    creator.username = "creator"
    m.creator = creator
    return m


def _override_deps(user: MagicMock, member: MagicMock) -> None:
    """Override FastAPI dependencies for testing."""
    from app.core.deps import get_current_active_user, get_group_membership, get_session

    async def fake_session():
        yield AsyncMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_group_membership] = lambda: member


def _clear_deps() -> None:
    app.dependency_overrides.clear()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestCreateMeeting:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.get_meeting")
    @patch("app.api.v1.endpoints.meetings.create_meeting")
    def test_create_success(
        self, mock_create: MagicMock, mock_get: MagicMock
    ) -> None:
        meeting = _mock_meeting(created_by=self.user.id)
        mock_create.return_value = meeting
        mock_get.return_value = meeting

        group_id = uuid.uuid4()
        res = self.client.post(
            f"/api/v1/groups/{group_id}/meetings",
            json={
                "title": "Encontro Teste",
                "meeting_type": "in_person",
                "location": "Café",
                "scheduled_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                "duration_minutes": 60,
            },
        )

        assert res.status_code == 201

    @patch("app.api.v1.endpoints.meetings.create_meeting")
    def test_create_past_date_returns_422(self, mock_create: MagicMock) -> None:
        from app.services.meeting import MeetingError

        mock_create.side_effect = MeetingError(
            "A data do encontro deve ser no futuro.", status_code=422
        )

        group_id = uuid.uuid4()
        res = self.client.post(
            f"/api/v1/groups/{group_id}/meetings",
            json={
                "title": "Test",
                "meeting_type": "in_person",
                "location": "X",
                "scheduled_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
                "duration_minutes": 60,
            },
        )

        assert res.status_code == 422


class TestListMeetings:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.list_meetings")
    def test_list_upcoming(self, mock_list: MagicMock) -> None:
        meeting = _mock_meeting()
        mock_list.return_value = ([meeting], None)

        group_id = uuid.uuid4()
        res = self.client.get(
            f"/api/v1/groups/{group_id}/meetings?filter=upcoming"
        )

        assert res.status_code == 200
        body = res.json()
        assert len(body["meetings"]) == 1
        assert body["next_cursor"] is None

    @patch("app.api.v1.endpoints.meetings.list_meetings")
    def test_list_past(self, mock_list: MagicMock) -> None:
        mock_list.return_value = ([], None)

        group_id = uuid.uuid4()
        res = self.client.get(
            f"/api/v1/groups/{group_id}/meetings?filter=past"
        )

        assert res.status_code == 200
        assert res.json()["meetings"] == []


class TestGetMeeting:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.get_meeting")
    def test_get_success(self, mock_get: MagicMock) -> None:
        meeting = _mock_meeting()
        mock_get.return_value = meeting

        res = self.client.get(f"/api/v1/meetings/{meeting.id}")

        assert res.status_code == 200
        assert res.json()["title"] == "Test Meeting"

    @patch("app.api.v1.endpoints.meetings.get_meeting")
    def test_get_not_found(self, mock_get: MagicMock) -> None:
        from app.services.meeting import MeetingError

        mock_get.side_effect = MeetingError(
            "Encontro não encontrado.", status_code=404
        )

        res = self.client.get(f"/api/v1/meetings/{uuid.uuid4()}")
        assert res.status_code == 404


class TestUpdateRsvp:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.get_meeting")
    @patch("app.api.v1.endpoints.meetings.update_rsvp")
    def test_rsvp_going(self, mock_rsvp: MagicMock, mock_get: MagicMock) -> None:
        rsvp = MagicMock()
        rsvp.status = "going"
        mock_rsvp.return_value = rsvp
        meeting = _mock_meeting()
        mock_get.return_value = meeting

        meeting_id = uuid.uuid4()
        res = self.client.post(
            f"/api/v1/meetings/{meeting_id}/rsvp",
            json={"status": "going"},
        )

        assert res.status_code == 200


class TestDeleteMeeting:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.delete_meeting")
    def test_delete_success(self, mock_delete: MagicMock) -> None:
        mock_delete.return_value = uuid.uuid4()

        meeting_id = uuid.uuid4()
        res = self.client.delete(f"/api/v1/meetings/{meeting_id}")

        assert res.status_code == 204

    @patch("app.api.v1.endpoints.meetings.delete_meeting")
    def test_delete_forbidden(self, mock_delete: MagicMock) -> None:
        from app.services.meeting import MeetingError

        mock_delete.side_effect = MeetingError(
            "Apenas o criador ou administradores podem realizar esta ação.",
            status_code=403,
        )

        res = self.client.delete(f"/api/v1/meetings/{uuid.uuid4()}")
        assert res.status_code == 403


class TestCalendarEndpoints:
    def setup_method(self) -> None:
        self.user = _mock_user()
        self.member = _mock_member(user_id=self.user.id)
        _override_deps(self.user, self.member)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.meetings.generate_ics")
    @patch("app.api.v1.endpoints.meetings.get_meeting")
    def test_download_ics_content_type(
        self, mock_get: MagicMock, mock_ics: MagicMock
    ) -> None:
        meeting = _mock_meeting()
        mock_get.return_value = meeting
        mock_ics.return_value = "BEGIN:VCALENDAR\r\nEND:VCALENDAR"

        res = self.client.post(f"/api/v1/meetings/{meeting.id}/calendar")

        assert res.status_code == 200
        assert "text/calendar" in res.headers["content-type"]

    @patch("app.api.v1.endpoints.meetings.generate_google_calendar_url")
    @patch("app.api.v1.endpoints.meetings.get_meeting")
    def test_google_calendar_url(
        self, mock_get: MagicMock, mock_url: MagicMock
    ) -> None:
        meeting = _mock_meeting()
        mock_get.return_value = meeting
        mock_url.return_value = "https://calendar.google.com/calendar/r/eventedit?text=Test"

        res = self.client.get(
            f"/api/v1/meetings/{meeting.id}/google-calendar-url"
        )

        assert res.status_code == 200
        assert "url" in res.json()
        assert res.json()["url"].startswith("https://calendar.google.com")
