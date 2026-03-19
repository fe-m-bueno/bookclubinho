"""Testes unitários para app.services.reading_progress."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import RedisError

from app.db.models.round import RoundStatus
from app.services.reading_progress import (
    ReadingProgressError,
    cleanup_expired_streaks,
    get_group_progress,
    get_my_progress,
    log_progress,
)

# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.status = overrides.get("status", RoundStatus.READING)
    r.book_page_count = overrides.get("book_page_count")
    return r


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.role = overrides.get("role", "member")
    return m


def _make_user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid.uuid4())
    u.streak_current = overrides.get("streak_current", 0)
    u.streak_longest = overrides.get("streak_longest", 0)
    u.streak_last_update = overrides.get("streak_last_update", None)
    u.timezone = overrides.get("timezone", "America/Sao_Paulo")
    return u


def _make_progress(**overrides: object) -> MagicMock:
    p = MagicMock()
    p.id = overrides.get("id", uuid.uuid4())
    p.round_id = overrides.get("round_id", uuid.uuid4())
    p.user_id = overrides.get("user_id", uuid.uuid4())
    p.current_page = overrides.get("current_page")
    p.percentage = overrides.get("percentage", 0.0)
    p.progress_type = overrides.get("progress_type", "percentage")
    p.total_pages = overrides.get("total_pages")
    p.note = overrides.get("note")
    p.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    return p


def _db_for_log(round_: MagicMock, member: MagicMock, user: MagicMock | None = None) -> AsyncMock:
    """Mock db for log_progress: verify_round_member (2 queries) → fast streak read → streak lock → groups."""
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member

    u = user or _make_user()

    # Fast-path streak check: SELECT streak_last_update, timezone (.one_or_none())
    res_fast = MagicMock()
    fast_row = MagicMock()
    fast_row.streak_last_update = u.streak_last_update
    fast_row.timezone = "America/Sao_Paulo"
    res_fast.one_or_none.return_value = fast_row

    # FOR UPDATE streak lock: SELECT User (.scalar_one_or_none())
    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = u

    # After streak update, emit events fetches groups
    res_groups = MagicMock()
    res_groups.all.return_value = []

    db.execute = AsyncMock(side_effect=[res_round, res_member, res_fast, res_user, res_groups])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    return db


def _db_for_get_my(round_: MagicMock, member: MagicMock, progress: MagicMock | None) -> AsyncMock:
    """Mock db: verify_round_member (round+member) then get progress."""
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_progress = MagicMock()
    res_progress.scalar_one_or_none.return_value = progress
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_progress])
    return db


# ── log_progress ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_progress_success_with_percentage() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=None)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=42.0
        )

    db.add.assert_called_once()
    assert db.flush.call_count >= 1
    db.refresh.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.percentage == 42.0
    assert added.current_page is None


@pytest.mark.asyncio
async def test_log_progress_success_with_page_and_page_count() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=200)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=100, percentage=None
        )

    added = db.add.call_args[0][0]
    assert added.current_page == 100
    assert added.percentage == 50.0


@pytest.mark.asyncio
async def test_log_progress_page_at_page_count_caps_to_100() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=300)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=300, percentage=None
        )

    added = db.add.call_args[0][0]
    assert added.percentage == 100.0


@pytest.mark.asyncio
async def test_log_progress_page_exceeds_page_count_caps_to_100() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=300)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=350, percentage=None
        )

    added = db.add.call_args[0][0]
    assert added.percentage == 100.0


@pytest.mark.asyncio
async def test_log_progress_page_without_page_count_defaults_to_zero() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=None)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=50, percentage=None
        )

    added = db.add.call_args[0][0]
    assert added.percentage == 0.0
    assert added.current_page == 50


@pytest.mark.asyncio
async def test_log_progress_wrong_status_raises_409() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    with pytest.raises(ReadingProgressError) as exc_info:
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=50.0
        )
    assert exc_info.value.status_code == 409
    assert "leitura" in str(exc_info.value)


@pytest.mark.asyncio
async def test_log_progress_reviewing_status_raises_409() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.REVIEWING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    with pytest.raises(ReadingProgressError) as exc_info:
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=50.0
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_log_progress_not_member_raises_404() -> None:
    """verify_round_member raises RoundError(404) — propagates through."""
    from app.services.round import RoundError

    user_id = uuid.uuid4()
    db = AsyncMock()
    res_not_found = MagicMock()
    res_not_found.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res_not_found)

    with pytest.raises(RoundError) as exc_info:
        await log_progress(
            db,
            round_id=uuid.uuid4(),
            user_id=user_id,
            current_page=None,
            percentage=50.0,
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_log_progress_percentage_used_when_no_page_count() -> None:
    """When only pct given and no page_count, the given pct is stored directly."""
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=None)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=66.0
        )

    added = db.add.call_args[0][0]
    assert added.percentage == 66.0


@pytest.mark.asyncio
async def test_log_progress_stores_note_and_total_pages() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, book_page_count=None)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db,
            round_id=round_.id,
            user_id=user_id,
            current_page=None,
            percentage=50.0,
            total_pages=400,
            note="Que capítulo incrível!",
        )

    added = db.add.call_args[0][0]
    assert added.total_pages == 400
    assert added.note == "Que capítulo incrível!"


# ── Streak tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_progress_streak_today_no_change() -> None:
    """If streak_last_update == today, streak_current doesn't change."""
    user_id = uuid.uuid4()
    today = date.today()
    user = _make_user(streak_current=5, streak_last_update=today)
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=30.0
        )

    assert user.streak_current == 5  # unchanged


@pytest.mark.asyncio
async def test_log_progress_streak_yesterday_increments() -> None:
    """If streak_last_update == yesterday, streak_current += 1."""
    user_id = uuid.uuid4()
    yesterday = date.today() - timedelta(days=1)
    user = _make_user(streak_current=3, streak_longest=3, streak_last_update=yesterday)
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=30.0
        )

    assert user.streak_current == 4
    assert user.streak_longest == 4  # new record


@pytest.mark.asyncio
async def test_log_progress_streak_missed_day_resets_to_1() -> None:
    """If streak_last_update is older than yesterday, streak_current resets to 1."""
    user_id = uuid.uuid4()
    two_days_ago = date.today() - timedelta(days=2)
    user = _make_user(streak_current=10, streak_longest=10, streak_last_update=two_days_ago)
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=30.0
        )

    assert user.streak_current == 1
    assert user.streak_longest == 10  # not changed, still personal best


@pytest.mark.asyncio
async def test_log_progress_streak_null_last_update_starts_at_1() -> None:
    """First ever reading — streak starts at 1."""
    user_id = uuid.uuid4()
    user = _make_user(streak_current=0, streak_longest=0, streak_last_update=None)
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=30.0
        )

    assert user.streak_current == 1
    assert user.streak_longest == 1


# ── Redis event tests ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_progress_emits_progress_updated_event() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    user = _make_user()
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=50.0
        )

    # Check progress_updated was emitted
    xadd_calls = mock_redis.xadd.call_args_list
    stream_keys = [call[0][0] for call in xadd_calls]
    payloads = [call[0][1] for call in xadd_calls]
    assert any(f"bookclub:group:{round_.group_id}:events" == k for k in stream_keys)
    assert any(p.get("type") == "progress_updated" for p in payloads)


@pytest.mark.asyncio
async def test_log_progress_emits_approaching_end_when_80_percent() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    user = _make_user()
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=85.0
        )

    payloads = [call[0][1] for call in mock_redis.xadd.call_args_list]
    assert any(p.get("type") == "approaching_end" for p in payloads)


@pytest.mark.asyncio
async def test_log_progress_no_approaching_end_below_80_percent() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    user = _make_user()
    db = _db_for_log(round_, member, user)

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=79.9
        )

    payloads = [call[0][1] for call in mock_redis.xadd.call_args_list]
    assert not any(p.get("type") == "approaching_end" for p in payloads)


@pytest.mark.asyncio
async def test_log_progress_redis_error_does_not_propagate() -> None:
    """Redis failures should not break progress logging."""
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)
    db = _db_for_log(round_, member)

    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(side_effect=RedisError("Redis down"))
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        # Should not raise
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=50.0
        )


@pytest.mark.asyncio
async def test_log_progress_emits_streak_milestone() -> None:
    """A 7-day streak should emit a streak_milestone event."""
    user_id = uuid.uuid4()
    yesterday = date.today() - timedelta(days=1)
    user = _make_user(
        id=user_id,
        streak_current=6,  # will become 7 — a milestone
        streak_longest=6,
        streak_last_update=yesterday,
    )
    round_ = _make_round(status=RoundStatus.READING)
    member = _make_member(user_id=user_id)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    # Fast-path streak check (one_or_none)
    res_fast = MagicMock()
    fast_row = MagicMock()
    fast_row.streak_last_update = user.streak_last_update  # yesterday — not today
    fast_row.timezone = "America/Sao_Paulo"
    res_fast.one_or_none.return_value = fast_row
    # FOR UPDATE
    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = user
    # Groups result — user belongs to 1 group
    group_id = uuid.uuid4()
    res_groups = MagicMock()
    res_groups.all.return_value = [(group_id,)]
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_fast, res_user, res_groups])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    mock_redis = AsyncMock()
    with patch("app.services.reading_progress.get_redis", return_value=mock_redis):
        await log_progress(
            db, round_id=round_.id, user_id=user_id, current_page=None, percentage=30.0
        )

    payloads = [call[0][1] for call in mock_redis.xadd.call_args_list]
    assert any(p.get("type") == "streak_milestone" and p.get("milestone") == "7" for p in payloads)


# ── get_my_progress ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_my_progress_returns_latest() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id)
    progress = _make_progress(user_id=user_id, percentage=80.0)
    db = _db_for_get_my(round_, member, progress)

    result = await get_my_progress(db, round_id=round_.id, user_id=user_id)
    assert result is progress


@pytest.mark.asyncio
async def test_get_my_progress_returns_none_when_no_entries() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id)
    db = _db_for_get_my(round_, member, None)

    result = await get_my_progress(db, round_id=round_.id, user_id=user_id)
    assert result is None


@pytest.mark.asyncio
async def test_get_my_progress_not_member_raises() -> None:
    from app.services.round import RoundError

    db = AsyncMock()
    res_not_found = MagicMock()
    res_not_found.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res_not_found)

    with pytest.raises(RoundError) as exc_info:
        await get_my_progress(db, round_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


# ── get_group_progress ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_group_progress_returns_all_members() -> None:
    """All group members are returned, including those with no progress."""
    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member

    row_with_progress = MagicMock()
    row_with_progress.__getitem__ = lambda self, key: {
        "user_id": user_id,
        "current_page": 100,
        "percentage": 50.0,
        "updated_at": datetime(2026, 1, 1, tzinfo=UTC),
    }[key]

    row_no_progress = MagicMock()
    row_no_progress.__getitem__ = lambda self, key: {
        "user_id": other_user_id,
        "current_page": None,
        "percentage": 0.0,
        "updated_at": None,
    }[key]

    res_group = MagicMock()
    res_group.mappings.return_value.all.return_value = [row_with_progress, row_no_progress]

    db.execute = AsyncMock(side_effect=[res_round, res_member, res_group])

    result = await get_group_progress(db, round_id=round_.id, user_id=user_id)

    assert len(result) == 2
    assert result[0]["user_id"] == str(user_id)
    assert result[0]["percentage"] == 50.0
    assert result[0]["is_finished"] is False
    assert result[1]["user_id"] == str(other_user_id)
    assert result[1]["percentage"] == 0.0
    assert result[1]["updated_at"] is None


@pytest.mark.asyncio
async def test_get_group_progress_finished_member() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member

    row_finished = MagicMock()
    row_finished.__getitem__ = lambda self, key: {
        "user_id": user_id,
        "current_page": 300,
        "percentage": 100.0,
        "updated_at": datetime(2026, 1, 10, tzinfo=UTC),
    }[key]

    res_group = MagicMock()
    res_group.mappings.return_value.all.return_value = [row_finished]

    db.execute = AsyncMock(side_effect=[res_round, res_member, res_group])

    result = await get_group_progress(db, round_id=round_.id, user_id=user_id)

    assert len(result) == 1
    assert result[0]["is_finished"] is True
    assert result[0]["percentage"] == 100.0


@pytest.mark.asyncio
async def test_get_group_progress_not_member_raises() -> None:
    from app.services.round import RoundError

    db = AsyncMock()
    res_not_found = MagicMock()
    res_not_found.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res_not_found)

    with pytest.raises(RoundError) as exc_info:
        await get_group_progress(db, round_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


# ── cleanup_expired_streaks ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_expired_streaks_resets_users() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.rowcount = 5
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()

    count = await cleanup_expired_streaks(db)

    assert count == 5
    db.execute.assert_called_once()
    db.flush.assert_called_once()
