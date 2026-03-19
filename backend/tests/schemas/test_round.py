"""Testes de validação dos schemas de round."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from app.schemas.round import (
    BookSummary,
    FinalizeResponse,
    NominationSummary,
    RoundCreateRequest,
    RoundCreateResponse,
    RoundDetailResponse,
    RoundListItem,
    RoundListResponse,
    RoundUpdateRequest,
)


# ── RoundCreateRequest ────────────────────────────────────────────────────────


def test_round_create_request_no_deadline() -> None:
    req = RoundCreateRequest()
    assert req.deadline is None


def test_round_create_request_with_deadline() -> None:
    req = RoundCreateRequest(deadline=date(2030, 1, 1))
    assert req.deadline == date(2030, 1, 1)


# ── RoundUpdateRequest ────────────────────────────────────────────────────────


def test_round_update_request_empty() -> None:
    req = RoundUpdateRequest()
    assert req.deadline is None
    assert req.status is None


def test_round_update_request_status_only() -> None:
    req = RoundUpdateRequest(status="voting")
    assert req.status == "voting"
    assert req.deadline is None


def test_round_update_request_both_fields() -> None:
    req = RoundUpdateRequest(deadline=date(2030, 6, 1), status="reading")
    assert req.deadline == date(2030, 6, 1)
    assert req.status == "reading"


# ── NominationSummary ─────────────────────────────────────────────────────────


def test_nomination_summary_minimal() -> None:
    nom = NominationSummary(
        id=str(uuid.uuid4()),
        book_id="book-1",
        book_title="Dom Casmurro",
        book_author=None,
        book_cover_url=None,
        book_page_count=None,
        pitch=None,
        user_id=str(uuid.uuid4()),
        nominated_at=datetime(2026, 1, 1, tzinfo=UTC),
        vote_count=0,
    )
    assert nom.vote_count == 0
    assert nom.book_author is None


def test_nomination_summary_with_votes() -> None:
    nom = NominationSummary(
        id=str(uuid.uuid4()),
        book_id="b2",
        book_title="1984",
        book_author="Orwell",
        book_cover_url="https://example.com/cover.jpg",
        book_page_count=328,
        pitch="Leitura essencial",
        user_id=str(uuid.uuid4()),
        nominated_at=datetime(2026, 3, 1, tzinfo=UTC),
        vote_count=5,
    )
    assert nom.vote_count == 5
    assert nom.book_page_count == 328


# ── RoundListItem ─────────────────────────────────────────────────────────────


def test_round_list_item_defaults() -> None:
    item = RoundListItem(
        id=str(uuid.uuid4()),
        round_number=1,
        book_title=None,
        status="nominating",
        deadline=None,
        started_at=None,
        finished_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert item.nomination_count == 0
    assert item.book_title is None


def test_round_list_item_with_nominations() -> None:
    item = RoundListItem(
        id=str(uuid.uuid4()),
        round_number=3,
        book_title="Escolhido",
        status="reading",
        deadline=date(2026, 6, 30),
        started_at=datetime(2026, 4, 1, tzinfo=UTC),
        finished_at=None,
        created_at=datetime(2026, 3, 1, tzinfo=UTC),
        nomination_count=4,
    )
    assert item.round_number == 3
    assert item.nomination_count == 4


# ── RoundListResponse ─────────────────────────────────────────────────────────


def test_round_list_response_empty() -> None:
    resp = RoundListResponse(rounds=[], next_cursor=None)
    assert resp.rounds == []
    assert resp.next_cursor is None


def test_round_list_response_with_cursor() -> None:
    item = RoundListItem(
        id=str(uuid.uuid4()),
        round_number=2,
        book_title=None,
        status="voting",
        deadline=None,
        started_at=None,
        finished_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    resp = RoundListResponse(rounds=[item], next_cursor=1)
    assert resp.next_cursor == 1
    assert len(resp.rounds) == 1


# ── RoundCreateResponse ───────────────────────────────────────────────────────


def test_round_create_response() -> None:
    resp = RoundCreateResponse(
        id=str(uuid.uuid4()),
        round_number=1,
        status="nominating",
        deadline=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    assert resp.round_number == 1
    assert resp.status == "nominating"


# ── RoundDetailResponse ───────────────────────────────────────────────────────


def test_round_detail_response_empty_nominations() -> None:
    resp = RoundDetailResponse(
        id=str(uuid.uuid4()),
        round_number=1,
        book_id=None,
        book_title=None,
        book_author=None,
        book_cover_url=None,
        book_page_count=None,
        status="nominating",
        deadline=None,
        started_at=None,
        finished_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        nominations=[],
    )
    assert resp.nominations == []
    assert resp.book_id is None


# ── BookSummary / FinalizeResponse ────────────────────────────────────────────


def test_book_summary_minimal() -> None:
    bs = BookSummary(book_id="b1", title="Titulo", author=None, cover_url=None, page_count=None)
    assert bs.book_id == "b1"
    assert bs.page_count is None


def test_book_summary_full() -> None:
    bs = BookSummary(
        book_id="b2",
        title="1984",
        author="George Orwell",
        cover_url="https://example.com/cover.jpg",
        page_count=328,
    )
    assert bs.author == "George Orwell"
    assert bs.page_count == 328


def test_finalize_response_no_tiebreak() -> None:
    resp = FinalizeResponse(
        book=BookSummary(book_id="b1", title="Livro", author=None, cover_url=None, page_count=200),
        was_tiebreak=False,
    )
    assert resp.was_tiebreak is False
    assert resp.book.title == "Livro"


def test_finalize_response_with_tiebreak() -> None:
    resp = FinalizeResponse(
        book=BookSummary(book_id="b2", title="Empate", author="Autor", cover_url=None, page_count=None),
        was_tiebreak=True,
    )
    assert resp.was_tiebreak is True
