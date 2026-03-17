"""Testes unitários para app.services.round."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.models.round import RoundStatus
from app.services.round import (
    RoundError,
    create_round,
    delete_round,
    get_current_round,
    list_rounds,
    update_round,
    verify_round_admin,
)
from tests.conftest import make_user, mock_db_returning


# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.round_number = overrides.get("round_number", 1)
    r.status = overrides.get("status", RoundStatus.NOMINATING)
    r.deadline = overrides.get("deadline", None)
    r.started_at = overrides.get("started_at", None)
    r.finished_at = overrides.get("finished_at", None)
    r.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    r.created_by = overrides.get("created_by", uuid.uuid4())
    r.nominations = overrides.get("nominations", [])
    return r


def _make_nomination(**overrides: object) -> MagicMock:
    n = MagicMock()
    n.id = overrides.get("id", uuid.uuid4())
    n.book_id = overrides.get("book_id", "book-123")
    n.book_title = overrides.get("book_title", "Dom Casmurro")
    n.book_author = overrides.get("book_author", "Machado de Assis")
    n.votes = overrides.get("votes", [])
    return n


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.role = overrides.get("role", "admin")
    return m


# ── verify_round_admin ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_round_admin_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id, group_id=round_.group_id, role="admin")

    db = AsyncMock()
    result_round = MagicMock()
    result_round.scalar_one_or_none.return_value = round_
    result_member = MagicMock()
    result_member.scalar_one_or_none.return_value = member

    db.execute = AsyncMock(side_effect=[result_round, result_member])

    result = await verify_round_admin(db, round_id=round_.id, user_id=user_id)
    assert result is round_


@pytest.mark.asyncio
async def test_verify_round_admin_round_not_found() -> None:
    db = mock_db_returning(None)
    with pytest.raises(RoundError) as exc_info:
        await verify_round_admin(db, round_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_verify_round_admin_not_member() -> None:
    round_ = _make_round()
    db = AsyncMock()
    result_round = MagicMock()
    result_round.scalar_one_or_none.return_value = round_
    result_member = MagicMock()
    result_member.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[result_round, result_member])

    with pytest.raises(RoundError) as exc_info:
        await verify_round_admin(db, round_id=round_.id, user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_verify_round_admin_not_admin() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id, group_id=round_.group_id, role="member")

    db = AsyncMock()
    result_round = MagicMock()
    result_round.scalar_one_or_none.return_value = round_
    result_member = MagicMock()
    result_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[result_round, result_member])

    with pytest.raises(RoundError) as exc_info:
        await verify_round_admin(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 403


# ── create_round ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_round_success() -> None:
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()

    db = AsyncMock()
    # First execute: no active round
    res_active = MagicMock()
    res_active.scalar_one_or_none.return_value = None
    # Second execute: max round_number = None
    res_max = MagicMock()
    res_max.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[res_active, res_max])
    db.add = MagicMock()
    db.flush = AsyncMock()

    round_ = await create_round(db, group_id=group_id, user_id=user_id)
    assert round_.round_number == 1
    assert round_.status == RoundStatus.NOMINATING


@pytest.mark.asyncio
async def test_create_round_active_exists() -> None:
    group_id = uuid.uuid4()
    existing = _make_round(status=RoundStatus.VOTING)

    db = AsyncMock()
    res_active = MagicMock()
    res_active.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=res_active)

    with pytest.raises(RoundError) as exc_info:
        await create_round(db, group_id=group_id, user_id=uuid.uuid4())
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_create_round_deadline_in_past() -> None:
    group_id = uuid.uuid4()

    db = AsyncMock()
    res_active = MagicMock()
    res_active.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res_active)

    with pytest.raises(RoundError) as exc_info:
        await create_round(db, group_id=group_id, user_id=uuid.uuid4(), deadline=date(2000, 1, 1))
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_create_round_increments_number() -> None:
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()

    db = AsyncMock()
    res_active = MagicMock()
    res_active.scalar_one_or_none.return_value = None
    res_max = MagicMock()
    res_max.scalar_one_or_none.return_value = 5
    db.execute = AsyncMock(side_effect=[res_active, res_max])
    db.add = MagicMock()
    db.flush = AsyncMock()

    round_ = await create_round(db, group_id=group_id, user_id=user_id)
    assert round_.round_number == 6


# ── update_round ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_round_no_fields_raises() -> None:
    round_ = _make_round()
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await update_round(db, round_)
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_round_valid_transition() -> None:
    round_ = _make_round(status=RoundStatus.NOMINATING)
    db = AsyncMock()
    result = await update_round(db, round_, new_status=RoundStatus.VOTING)
    assert result.status == RoundStatus.VOTING


@pytest.mark.asyncio
async def test_update_round_invalid_transition() -> None:
    round_ = _make_round(status=RoundStatus.NOMINATING)
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await update_round(db, round_, new_status=RoundStatus.FINISHED)
    assert exc_info.value.status_code == 422
    assert "nominating" in str(exc_info.value)
    assert "finished" in str(exc_info.value)


@pytest.mark.asyncio
async def test_update_round_already_finished() -> None:
    round_ = _make_round(status=RoundStatus.FINISHED)
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await update_round(db, round_, new_status=RoundStatus.READING)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_round_invalid_status_string() -> None:
    round_ = _make_round(status=RoundStatus.NOMINATING)
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await update_round(db, round_, new_status="invalid_status")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_round_sets_finished_at_on_finish() -> None:
    round_ = _make_round(status=RoundStatus.REVIEWING)
    round_.finished_at = None
    db = AsyncMock()
    result = await update_round(db, round_, new_status=RoundStatus.FINISHED)
    assert result.finished_at is not None


@pytest.mark.asyncio
async def test_update_round_deadline_in_past() -> None:
    round_ = _make_round(status=RoundStatus.NOMINATING)
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await update_round(db, round_, deadline=date(2000, 1, 1))
    assert exc_info.value.status_code == 422


# ── delete_round ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_round_success() -> None:
    round_ = _make_round(status=RoundStatus.NOMINATING)
    db = AsyncMock()
    await delete_round(db, round_)
    db.delete.assert_called_once_with(round_)


@pytest.mark.asyncio
async def test_delete_round_not_nominating() -> None:
    round_ = _make_round(status=RoundStatus.VOTING)
    db = AsyncMock()
    with pytest.raises(RoundError) as exc_info:
        await delete_round(db, round_)
    assert exc_info.value.status_code == 409


# ── list_rounds ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_rounds_no_cursor() -> None:
    rounds = [_make_round(round_number=i) for i in range(3, 0, -1)]
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rounds
    db.execute = AsyncMock(return_value=result)

    items, next_cursor = await list_rounds(db, group_id=uuid.uuid4(), limit=10)
    assert len(items) == 3
    assert next_cursor is None


@pytest.mark.asyncio
async def test_list_rounds_returns_next_cursor() -> None:
    # Return limit+1 items to trigger pagination
    rounds = [_make_round(round_number=i) for i in range(11, 0, -1)]
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rounds
    db.execute = AsyncMock(return_value=result)

    items, next_cursor = await list_rounds(db, group_id=uuid.uuid4(), limit=10)
    assert len(items) == 10
    assert next_cursor == items[-1].round_number


# ── get_current_round ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_round_found() -> None:
    round_ = _make_round(status=RoundStatus.VOTING)
    db = mock_db_returning(round_)
    result = await get_current_round(db, group_id=uuid.uuid4())
    assert result is round_


@pytest.mark.asyncio
async def test_get_current_round_none() -> None:
    db = mock_db_returning(None)
    result = await get_current_round(db, group_id=uuid.uuid4())
    assert result is None
