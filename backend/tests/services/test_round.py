"""Testes unitários para app.services.round."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import RedisError

from app.db.models.round import RoundStatus
from app.schemas.round import NominationCreateRequest
from app.services.round import (
    RoundError,
    add_nomination,
    cast_vote,
    create_round,
    delete_round,
    finalize_round,
    finish_round,
    get_current_round,
    list_rounds,
    remove_nomination,
    start_review,
    start_voting,
    update_round,
    verify_round_admin,
    verify_round_member,
)
from tests.conftest import mock_db_returning

# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.round_number = overrides.get("round_number", 1)
    r.status = overrides.get("status", RoundStatus.NOMINATING)
    r.deadline = overrides.get("deadline")
    r.started_at = overrides.get("started_at")
    r.finished_at = overrides.get("finished_at")
    r.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    r.created_by = overrides.get("created_by", uuid.uuid4())
    r.nominations = overrides.get("nominations", [])
    r.book_id = overrides.get("book_id")
    r.book_title = overrides.get("book_title")
    r.book_author = overrides.get("book_author")
    r.book_cover_url = overrides.get("book_cover_url")
    r.book_page_count = overrides.get("book_page_count")
    r.tiebreak_info = overrides.get("tiebreak_info")
    return r


def _make_nomination(**overrides: object) -> MagicMock:
    n = MagicMock()
    n.id = overrides.get("id", uuid.uuid4())
    n.round_id = overrides.get("round_id", uuid.uuid4())
    n.user_id = overrides.get("user_id", uuid.uuid4())
    n.book_id = overrides.get("book_id", "book-123")
    n.book_title = overrides.get("book_title", "Dom Casmurro")
    n.book_author = overrides.get("book_author", "Machado de Assis")
    n.book_cover_url = overrides.get("book_cover_url")
    n.book_page_count = overrides.get("book_page_count")
    n.book_hardcover_slug = overrides.get("book_hardcover_slug")
    n.votes = overrides.get("votes", [])
    return n


def _make_vote(**overrides: object) -> MagicMock:
    v = MagicMock()
    v.id = overrides.get("id", uuid.uuid4())
    v.round_id = overrides.get("round_id", uuid.uuid4())
    v.user_id = overrides.get("user_id", uuid.uuid4())
    v.nomination_id = overrides.get("nomination_id", uuid.uuid4())
    return v


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.role = overrides.get("role", "admin")
    return m


def _make_nomination_request(**overrides: object) -> NominationCreateRequest:
    return NominationCreateRequest(
        book_id=overrides.get("book_id", "book-abc"),
        book_title=overrides.get("book_title", "Novo Livro"),
        book_author=overrides.get("book_author", "Autor"),
        book_hardcover_slug=overrides.get("book_hardcover_slug", "novo-livro"),
        pitch=overrides.get("pitch"),
    )


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


# ── verify_round_member ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_round_member_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round()
    member = _make_member(user_id=user_id, group_id=round_.group_id, role="member")

    db = AsyncMock()
    result_round = MagicMock()
    result_round.scalar_one_or_none.return_value = round_
    result_member = MagicMock()
    result_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[result_round, result_member])

    result = await verify_round_member(db, round_id=round_.id, user_id=user_id)
    assert result is round_


@pytest.mark.asyncio
async def test_verify_round_member_not_found() -> None:
    db = mock_db_returning(None)
    with pytest.raises(RoundError) as exc_info:
        await verify_round_member(db, round_id=uuid.uuid4(), user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_verify_round_member_not_member() -> None:
    round_ = _make_round()
    db = AsyncMock()
    result_round = MagicMock()
    result_round.scalar_one_or_none.return_value = round_
    result_member = MagicMock()
    result_member.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[result_round, result_member])

    with pytest.raises(RoundError) as exc_info:
        await verify_round_member(db, round_id=round_.id, user_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


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


# ── add_nomination ────────────────────────────────────────────────────────────


def _db_for_add_nomination(round_: MagicMock, member: MagicMock) -> AsyncMock:
    """Mock db that returns round then member (verify_round_member) then round again (re-fetch)."""
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_refetch = MagicMock()
    res_refetch.scalar_one.return_value = round_
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_refetch])
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_add_nomination_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[])
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_add_nomination(round_, member)
    data = _make_nomination_request()

    nom, _ = await add_nomination(db, round_id=round_.id, user_id=user_id, data=data)
    assert nom.book_id == data.book_id
    db.add.assert_called_once()
    db.flush.assert_called_once()


@pytest.mark.asyncio
async def test_add_nomination_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[])
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_add_nomination(round_, member)
    data = _make_nomination_request()

    with pytest.raises(RoundError) as exc_info:
        await add_nomination(db, round_id=round_.id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_add_nomination_max_reached() -> None:
    user_id = uuid.uuid4()
    existing_noms = [_make_nomination(user_id=user_id) for _ in range(3)]
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=existing_noms)
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_add_nomination(round_, member)
    data = _make_nomination_request(book_id="new-book")

    with pytest.raises(RoundError) as exc_info:
        await add_nomination(db, round_id=round_.id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 409
    assert "3" in str(exc_info.value)


@pytest.mark.asyncio
async def test_add_nomination_duplicate_book() -> None:
    user_id = uuid.uuid4()
    existing = _make_nomination(user_id=user_id, book_id="book-abc")
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[existing])
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_add_nomination(round_, member)
    data = _make_nomination_request(book_id="book-abc")

    with pytest.raises(RoundError) as exc_info:
        await add_nomination(db, round_id=round_.id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 409
    assert "já indicou" in str(exc_info.value)


@pytest.mark.asyncio
async def test_add_nomination_sanitizes_pitch() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[])
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_add_nomination(round_, member)
    data = _make_nomination_request(pitch="<script>alert('xss')</script>Excelente livro")

    nom, _ = await add_nomination(db, round_id=round_.id, user_id=user_id, data=data)
    assert "<script>" not in nom.pitch


# ── remove_nomination ─────────────────────────────────────────────────────────


def _db_for_remove_nomination(round_: MagicMock, member: MagicMock, nomination: MagicMock | None) -> AsyncMock:
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_nom = MagicMock()
    res_nom.scalar_one_or_none.return_value = nomination
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_nom])
    db.delete = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_remove_nomination_success() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(user_id=user_id)
    round_ = _make_round(status=RoundStatus.NOMINATING)
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_remove_nomination(round_, member, nom)

    await remove_nomination(db, round_id=round_.id, nomination_id=nom.id, user_id=user_id)
    db.delete.assert_called_once_with(nom)


@pytest.mark.asyncio
async def test_remove_nomination_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.VOTING)
    member = _make_member(user_id=user_id, role="member")
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[res_round, res_member])

    with pytest.raises(RoundError) as exc_info:
        await remove_nomination(db, round_id=round_.id, nomination_id=uuid.uuid4(), user_id=user_id)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_remove_nomination_not_found() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING)
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_remove_nomination(round_, member, None)

    with pytest.raises(RoundError) as exc_info:
        await remove_nomination(db, round_id=round_.id, nomination_id=uuid.uuid4(), user_id=user_id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_remove_nomination_not_owner() -> None:
    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    nom = _make_nomination(user_id=other_user_id)
    round_ = _make_round(status=RoundStatus.NOMINATING)
    member = _make_member(user_id=user_id, role="member")
    db = _db_for_remove_nomination(round_, member, nom)

    with pytest.raises(RoundError) as exc_info:
        await remove_nomination(db, round_id=round_.id, nomination_id=nom.id, user_id=user_id)
    assert exc_info.value.status_code == 403


# ── start_voting ──────────────────────────────────────────────────────────────


def _db_for_admin_action(round_: MagicMock, member: MagicMock) -> AsyncMock:
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[res_round, res_member])
    return db


def _db_for_finalize(
    round_: MagicMock,
    member: MagicMock,
    vote_counts: list[tuple],
) -> AsyncMock:
    """Mock db para finalize_round: round fetch, member fetch e vote GROUP BY."""
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_votes = MagicMock()
    res_votes.all.return_value = vote_counts
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_votes])
    return db


@pytest.mark.asyncio
async def test_start_voting_success() -> None:
    user_id = uuid.uuid4()
    noms = [_make_nomination(), _make_nomination()]
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=noms)
    round_.started_at = None
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    result = await start_voting(db, round_id=round_.id, user_id=user_id)
    assert result.status == RoundStatus.VOTING
    assert result.started_at is not None


@pytest.mark.asyncio
async def test_start_voting_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[_make_nomination(), _make_nomination()])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await start_voting(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_start_voting_too_few_nominations() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[_make_nomination()])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await start_voting(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_start_voting_sets_started_at() -> None:
    user_id = uuid.uuid4()
    noms = [_make_nomination(), _make_nomination()]
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=noms)
    round_.started_at = None
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    result = await start_voting(db, round_id=round_.id, user_id=user_id)
    assert result.started_at is not None


# ── cast_vote ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cast_vote_success() -> None:
    user_id = uuid.uuid4()
    nom_id = uuid.uuid4()
    nom = _make_nomination(id=nom_id)
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="member")

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = None  # no existing vote
    res_refetch = MagicMock()
    res_refetch.scalar_one.return_value = round_
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_existing, res_refetch])
    db.add = MagicMock()
    db.flush = AsyncMock()

    vote, _ = await cast_vote(db, round_id=round_.id, user_id=user_id, nomination_id=nom_id)
    assert vote.nomination_id == nom_id
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_cast_vote_change_deletes_old() -> None:
    user_id = uuid.uuid4()
    nom_id = uuid.uuid4()
    nom = _make_nomination(id=nom_id)
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="member")
    existing_vote = _make_vote(user_id=user_id, round_id=round_.id)

    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = existing_vote
    res_refetch = MagicMock()
    res_refetch.scalar_one.return_value = round_
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_existing, res_refetch])
    db.delete = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    await cast_vote(db, round_id=round_.id, user_id=user_id, nomination_id=nom_id)
    db.delete.assert_called_once_with(existing_vote)
    db.add.assert_called_once()
    # flush called twice: once after delete, once after add
    assert db.flush.call_count == 2


@pytest.mark.asyncio
async def test_cast_vote_wrong_status() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination()
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[nom])
    member = _make_member(user_id=user_id, role="member")
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[res_round, res_member])

    with pytest.raises(RoundError) as exc_info:
        await cast_vote(db, round_id=round_.id, user_id=user_id, nomination_id=nom.id)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_cast_vote_invalid_nomination() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination()
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="member")
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(side_effect=[res_round, res_member])

    with pytest.raises(RoundError) as exc_info:
        await cast_vote(db, round_id=round_.id, user_id=user_id, nomination_id=uuid.uuid4())
    assert exc_info.value.status_code == 404


# ── finalize_round ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_finalize_round_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.NOMINATING, nominations=[])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await finalize_round(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_finalize_round_no_votes() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(votes=[])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[])

    with pytest.raises(RoundError) as exc_info:
        await finalize_round(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_finalize_round_success_clear_winner() -> None:
    user_id = uuid.uuid4()
    winner_nom = _make_nomination(book_id="winner", book_title="O Vencedor", votes=[_make_vote(), _make_vote()])
    loser_nom = _make_nomination(book_id="loser", book_title="O Perdedor", votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[winner_nom, loser_nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(winner_nom.id, 2), (loser_nom.id, 1)])

    with patch("app.services.round.get_redis", return_value=AsyncMock()):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.status == RoundStatus.READING
    assert result.book_id == "winner"
    assert result.book_title == "O Vencedor"
    assert result.tiebreak_info is not None
    assert result.tiebreak_info["was_tiebreak"] is False
    assert result.tiebreak_info["winner_id"] == str(winner_nom.id)
    assert "method" not in result.tiebreak_info


@pytest.mark.asyncio
async def test_finalize_round_tiebreak() -> None:
    user_id = uuid.uuid4()
    nom_a = _make_nomination(book_id="a", book_title="Livro A", votes=[_make_vote()])
    nom_b = _make_nomination(book_id="b", book_title="Livro B", votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom_a, nom_b])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom_a.id, 1), (nom_b.id, 1)])

    with (
        patch("app.services.round.secrets.choice", return_value=nom_a),
        patch("app.services.round.get_redis", return_value=AsyncMock()),
    ):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.book_id == "a"
    assert result.tiebreak_info is not None
    assert result.tiebreak_info["was_tiebreak"] is True
    assert result.tiebreak_info["method"] == "random"
    assert result.tiebreak_info["winner_id"] == str(nom_a.id)
    assert len(result.tiebreak_info["tied_nominations"]) == 2


@pytest.mark.asyncio
async def test_finalize_round_copies_book_fields() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(
        book_id="bk-1",
        book_title="Livro Teste",
        book_author="Autor",
        book_cover_url="https://example.com/cover.jpg",
        book_page_count=300,
        votes=[_make_vote()],
    )
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    with patch("app.services.round.get_redis", return_value=AsyncMock()):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.book_id == "bk-1"
    assert result.book_title == "Livro Teste"
    assert result.book_author == "Autor"
    assert result.book_cover_url == "https://example.com/cover.jpg"
    assert result.book_page_count == 300


@pytest.mark.asyncio
async def test_finalize_round_sets_deadline() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])
    future_date = date(2099, 12, 31)

    with patch("app.services.round.get_redis", return_value=AsyncMock()):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id, deadline=future_date)
    assert result.deadline == future_date


@pytest.mark.asyncio
async def test_finalize_round_deadline_in_past_raises() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await finalize_round(db, round_id=round_.id, user_id=user_id, deadline=date(2000, 1, 1))
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_finalize_round_tiebreak_info_always_set() -> None:
    user_id = uuid.uuid4()
    winner = _make_nomination(book_id="w", book_title="Vencedor", votes=[_make_vote(), _make_vote()])
    loser = _make_nomination(book_id="l", book_title="Perdedor", votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[winner, loser])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(winner.id, 2), (loser.id, 1)])

    with patch("app.services.round.get_redis", return_value=AsyncMock()):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.tiebreak_info is not None
    assert result.tiebreak_info["was_tiebreak"] is False
    assert "method" not in result.tiebreak_info
    assert result.tiebreak_info["winner_id"] == str(winner.id)
    assert len(result.tiebreak_info["tied_nominations"]) == 1
    assert result.tiebreak_info["tied_nominations"][0]["votes"] == 2


@pytest.mark.asyncio
async def test_finalize_round_emits_redis_event() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(book_id="bk-1", book_title="Livro", votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    mock_redis = AsyncMock()
    with patch("app.services.round.get_redis", return_value=mock_redis):
        await finalize_round(db, round_id=round_.id, user_id=user_id)

    mock_redis.xadd.assert_called_once()
    stream_key, payload = mock_redis.xadd.call_args[0]
    assert stream_key == f"bookclub:group:{round_.group_id}:events"
    assert payload["type"] == "round_finalized"
    assert payload["was_tiebreak"] == "false"


@pytest.mark.asyncio
async def test_finalize_round_redis_failure_non_fatal() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(book_id="bk-1", votes=[_make_vote()])
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    mock_redis = AsyncMock()
    mock_redis.xadd = AsyncMock(side_effect=RedisError("Redis indisponível"))
    with patch("app.services.round.get_redis", return_value=mock_redis):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.status == RoundStatus.READING


@pytest.mark.asyncio
async def test_finalize_round_populates_book_genres() -> None:
    from app.schemas.hardcover import BookDetail

    user_id = uuid.uuid4()
    nom = _make_nomination(
        book_id="bk-1",
        book_title="Livro Teste",
        votes=[_make_vote()],
    )
    nom.book_hardcover_slug = "livro-teste"
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    book_detail = BookDetail(
        book_id="bk-1",
        title="Livro Teste",
        author="Autor",
        cover_url=None,
        slug="livro-teste",
        description=None,
        page_count=300,
        genres=["Fiction", "Drama"],
    )
    mock_client = AsyncMock()
    mock_client.get_book = AsyncMock(return_value=book_detail)
    mock_client.aclose = AsyncMock()

    with (
        patch("app.services.round.get_redis", return_value=AsyncMock()),
        patch("app.services.hardcover.HardcoverClient", return_value=mock_client),
    ):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.book_genres == ["Fiction", "Drama"]
    mock_client.get_book.assert_called_once_with("livro-teste")
    mock_client.aclose.assert_called_once()


@pytest.mark.asyncio
async def test_finalize_round_genres_graceful_on_hardcover_failure() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(book_id="bk-1", votes=[_make_vote()])
    nom.book_hardcover_slug = "livro-teste"
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    mock_client = AsyncMock()
    mock_client.get_book = AsyncMock(return_value=None)
    mock_client.aclose = AsyncMock()

    with (
        patch("app.services.round.get_redis", return_value=AsyncMock()),
        patch("app.services.hardcover.HardcoverClient", return_value=mock_client),
    ):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.status == RoundStatus.READING
    mock_client.aclose.assert_called_once()


@pytest.mark.asyncio
async def test_finalize_round_genres_skipped_without_slug() -> None:
    user_id = uuid.uuid4()
    nom = _make_nomination(book_id="bk-1", votes=[_make_vote()])
    nom.book_hardcover_slug = None
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finalize(round_, member, vote_counts=[(nom.id, 1)])

    with (
        patch("app.services.round.get_redis", return_value=AsyncMock()),
        patch("app.services.hardcover.HardcoverClient") as mock_cls,
    ):
        result = await finalize_round(db, round_id=round_.id, user_id=user_id)

    assert result.status == RoundStatus.READING
    mock_cls.assert_not_called()


# ── start_review ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_review_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, nominations=[])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    result = await start_review(db, round_id=round_.id, user_id=user_id)
    assert result.status == RoundStatus.REVIEWING


@pytest.mark.asyncio
async def test_start_review_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.VOTING, nominations=[])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await start_review(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409


# ── finish_round ──────────────────────────────────────────────────────────────


def _db_for_finish(round_: MagicMock, member: MagicMock, review_count: int) -> AsyncMock:
    db = AsyncMock()
    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_count = MagicMock()
    res_count.scalar_one.return_value = review_count
    db.execute = AsyncMock(side_effect=[res_round, res_member, res_count])
    return db


@pytest.mark.asyncio
async def test_finish_round_success() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.REVIEWING, nominations=[])
    round_.finished_at = None
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finish(round_, member, review_count=1)

    result = await finish_round(db, round_id=round_.id, user_id=user_id)
    assert result.status == RoundStatus.FINISHED
    assert result.finished_at is not None


@pytest.mark.asyncio
async def test_finish_round_wrong_status() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.READING, nominations=[])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_admin_action(round_, member)

    with pytest.raises(RoundError) as exc_info:
        await finish_round(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_finish_round_no_reviews_raises() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.REVIEWING, nominations=[])
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finish(round_, member, review_count=0)

    with pytest.raises(RoundError) as exc_info:
        await finish_round(db, round_id=round_.id, user_id=user_id)
    assert exc_info.value.status_code == 422
    assert "review" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_finish_round_sets_finished_at() -> None:
    user_id = uuid.uuid4()
    round_ = _make_round(status=RoundStatus.REVIEWING, nominations=[])
    round_.finished_at = None
    member = _make_member(user_id=user_id, role="admin")
    db = _db_for_finish(round_, member, review_count=2)

    result = await finish_round(db, round_id=round_.id, user_id=user_id)
    assert result.finished_at is not None
