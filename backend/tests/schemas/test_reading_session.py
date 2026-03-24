"""Testes unitários para app.schemas.reading_session."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.reading_session import (
    SessionListResponse,
    SessionResponse,
    SessionStartRequest,
    SessionStopRequest,
)

# ── SessionStartRequest ───────────────────────────────────────────────────────


def test_session_start_request_valid() -> None:
    req = SessionStartRequest(round_id="550e8400-e29b-41d4-a716-446655440000")
    assert req.round_id == "550e8400-e29b-41d4-a716-446655440000"


def test_session_start_request_missing_round_id_raises() -> None:
    with pytest.raises(ValidationError):
        SessionStartRequest()  # type: ignore[call-arg]


# ── SessionStopRequest ────────────────────────────────────────────────────────


def test_session_stop_request_no_override() -> None:
    req = SessionStopRequest()
    assert req.duration_override_minutes is None


def test_session_stop_request_with_override() -> None:
    req = SessionStopRequest(duration_override_minutes=45)
    assert req.duration_override_minutes == 45


def test_session_stop_request_zero_override() -> None:
    req = SessionStopRequest(duration_override_minutes=0)
    assert req.duration_override_minutes == 0


def test_session_stop_request_negative_override_raises() -> None:
    with pytest.raises(ValidationError):
        SessionStopRequest(duration_override_minutes=-1)


# ── SessionResponse ───────────────────────────────────────────────────────────


def test_session_response_active_session() -> None:
    now = datetime.now(UTC)
    resp = SessionResponse(
        id="session-id",
        user_id="user-id",
        round_id="round-id",
        started_at=now,
        ended_at=None,
        duration_minutes=None,
        created_at=now,
    )
    assert resp.ended_at is None
    assert resp.duration_minutes is None


def test_session_response_completed_session() -> None:
    start = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)
    end = datetime(2026, 3, 19, 10, 30, 0, tzinfo=UTC)
    resp = SessionResponse(
        id="session-id",
        user_id="user-id",
        round_id="round-id",
        started_at=start,
        ended_at=end,
        duration_minutes=30,
        created_at=start,
    )
    assert resp.ended_at == end
    assert resp.duration_minutes == 30


# ── SessionListResponse ───────────────────────────────────────────────────────


def test_session_list_response_empty() -> None:
    resp = SessionListResponse(sessions=[], total_duration_minutes=0, next_cursor=None)
    assert resp.sessions == []
    assert resp.total_duration_minutes == 0
    assert resp.next_cursor is None


def test_session_list_response_with_sessions() -> None:
    now = datetime.now(UTC)
    session = SessionResponse(
        id="s1",
        user_id="u1",
        round_id="r1",
        started_at=now,
        ended_at=now,
        duration_minutes=60,
        created_at=now,
    )
    resp = SessionListResponse(
        sessions=[session],
        total_duration_minutes=60,
        next_cursor="2026-03-19T10:00:00",
    )
    assert len(resp.sessions) == 1
    assert resp.total_duration_minutes == 60
    assert resp.next_cursor == "2026-03-19T10:00:00"
