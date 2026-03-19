"""Testes unitários para app.services.reading_session."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.models.round import RoundStatus
from app.services.reading_session import (
    ReadingSessionError,
    list_my_sessions,
    start_session,
    stop_session,
)


# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.status = overrides.get("status", RoundStatus.READING)
    return r


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.user_id = overrides.get("user_id", uuid.uuid4())
    return m


def _make_session(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.id = overrides.get("id", uuid.uuid4())
    s.user_id = overrides.get("user_id", uuid.uuid4())
    s.round_id = overrides.get("round_id", uuid.uuid4())
    s.started_at = overrides.get("started_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    s.ended_at = overrides.get("ended_at", None)
    s.duration_minutes = overrides.get("duration_minutes", None)
    s.created_at = overrides.get("created_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    return s


def _db_for_start(round_: MagicMock, member: MagicMock, active_session: MagicMock | None) -> AsyncMock:
    """Mock db for start_session: verify_round_member then check active session."""
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_active = MagicMock()
    res_active.scalar_one_or_none.return_value = active_session
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_active])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _db_for_stop(session: MagicMock | None, user: MagicMock | None) -> AsyncMock:
    """Mock db for stop_session: fetch session then fetch user."""
    db = AsyncMock()
    res_session = MagicMock()
    res_session.scalar_one_or_none.return_value = session
    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(side_effect=[res_session, res_user])
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ── start_session ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_session_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_start(round_, member, active_session=None)

    session = await start_session(db, round_id=round_.id, user_id=user_id)

    db.add.assert_called_once()
    db.flush.assert_called_once()
    db.refresh.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.user_id == user_id
    assert added.round_id == round_.id


@pytest.mark.asyncio
async def test_start_session_wrong_status_raises_409() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING)
    member = _make_member(user_id=user_id)
    db = _db_for_start(round_, member, active_session=None)

    with pytest.raises(ReadingSessionError) as exc_info:
        await start_session(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409
    assert "leitura" in str(exc_info.value)


@pytest.mark.asyncio
async def test_start_session_already_active_raises_409() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    active = _make_session(user_id=user_id)
    db = _db_for_start(round_, member, active_session=active)

    with pytest.raises(ReadingSessionError) as exc_info:
        await start_session(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409
    assert "ativa" in str(exc_info.value)


@pytest.mark.asyncio
async def test_start_session_not_member_raises_404() -> None:
    from app.services.round import RoundError

    db = AsyncMock()
    res_not_found = MagicMock()
    res_not_found.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res_not_found)

    with pytest.raises(RoundError) as exc_info:
        await start_session(db, round_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


# ── stop_session ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stop_session_success_calculates_duration() -> None:
    user_id = uuid.uuid4()
    started_at = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)
    session = _make_session(
        user_id=user_id,
        started_at=started_at,
        ended_at=None,
    )
    user = MagicMock()
    user.total_reading_time_minutes = 0
    db = _db_for_stop(session, user)

    with patch("app.services.reading_session.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 3, 19, 10, 30, 0, tzinfo=UTC)
        result = await stop_session(db, session_id=session.id, user_id=user_id)

    assert session.ended_at is not None
    assert session.duration_minutes == 30
    assert user.total_reading_time_minutes == 30


@pytest.mark.asyncio
async def test_stop_session_with_duration_override() -> None:
    user_id = uuid.uuid4()
    session = _make_session(user_id=user_id, ended_at=None)
    user = MagicMock()
    user.total_reading_time_minutes = 10
    db = _db_for_stop(session, user)

    await stop_session(db, session_id=session.id, user_id=user_id, duration_override_minutes=45)

    assert session.duration_minutes == 45
    assert user.total_reading_time_minutes == 55


@pytest.mark.asyncio
async def test_stop_session_not_found_raises_404() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ReadingSessionError) as exc_info:
        await stop_session(db, session_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_stop_session_wrong_owner_raises_404() -> None:
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    session = _make_session(user_id=owner_id, ended_at=None)
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = session
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ReadingSessionError) as exc_info:
        await stop_session(db, session_id=session.id, user_id=other_id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_stop_session_already_ended_raises_409() -> None:
    user_id = uuid.uuid4()
    session = _make_session(
        user_id=user_id,
        ended_at=datetime(2026, 3, 19, 11, 0, 0, tzinfo=UTC),
    )
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = session
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ReadingSessionError) as exc_info:
        await stop_session(db, session_id=session.id, user_id=user_id)
    assert exc_info.value.status_code == 409


# ── list_my_sessions ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_my_sessions_returns_sessions() -> None:
    user_id = uuid.uuid4()
    sessions = [_make_session(user_id=user_id, duration_minutes=30)]

    db = AsyncMock()
    # First call: auto_close (update) — returns a result with rowcount
    res_update = MagicMock()
    # Second call: list sessions
    res_sessions = MagicMock()
    res_sessions.scalars.return_value.all.return_value = sessions
    # Third call: aggregate total duration
    res_agg = MagicMock()
    res_agg.scalar.return_value = 30
    db.execute = AsyncMock(side_effect=[res_update, res_sessions, res_agg])
    db.flush = AsyncMock()

    result_sessions, total, next_cursor = await list_my_sessions(db, user_id=user_id)

    assert len(result_sessions) == 1
    assert total == 30
    assert next_cursor is None


@pytest.mark.asyncio
async def test_list_my_sessions_with_round_id_filter() -> None:
    user_id = uuid.uuid4()
    round_id = uuid.uuid4()

    db = AsyncMock()
    res_update = MagicMock()
    res_sessions = MagicMock()
    res_sessions.scalars.return_value.all.return_value = []
    res_agg = MagicMock()
    res_agg.scalar.return_value = 0
    db.execute = AsyncMock(side_effect=[res_update, res_sessions, res_agg])
    db.flush = AsyncMock()

    sessions, total, cursor = await list_my_sessions(db, user_id=user_id, round_id=round_id)

    assert sessions == []
    assert total == 0
    assert cursor is None


@pytest.mark.asyncio
async def test_list_my_sessions_pagination_cursor() -> None:
    """When more than limit sessions exist, next_cursor is set."""
    user_id = uuid.uuid4()
    limit = 2
    # Create 3 sessions — one more than limit
    sessions = [
        _make_session(
            user_id=user_id,
            created_at=datetime(2026, 3, 19, 10, i, 0, tzinfo=UTC),
            duration_minutes=10,
        )
        for i in range(3)
    ]

    db = AsyncMock()
    res_update = MagicMock()
    res_sessions = MagicMock()
    res_sessions.scalars.return_value.all.return_value = sessions  # 3 returned, limit=2
    res_agg = MagicMock()
    res_agg.scalar.return_value = 30
    db.execute = AsyncMock(side_effect=[res_update, res_sessions, res_agg])
    db.flush = AsyncMock()

    result_sessions, total, next_cursor = await list_my_sessions(
        db, user_id=user_id, limit=limit
    )

    assert len(result_sessions) == 2
    assert next_cursor is not None


@pytest.mark.asyncio
async def test_list_my_sessions_total_duration_zero_when_no_sessions() -> None:
    user_id = uuid.uuid4()

    db = AsyncMock()
    res_update = MagicMock()
    res_sessions = MagicMock()
    res_sessions.scalars.return_value.all.return_value = []
    res_agg = MagicMock()
    res_agg.scalar.return_value = None  # coalesce handles None
    db.execute = AsyncMock(side_effect=[res_update, res_sessions, res_agg])
    db.flush = AsyncMock()

    _, total, _ = await list_my_sessions(db, user_id=user_id)

    assert total == 0
