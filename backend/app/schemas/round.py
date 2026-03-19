"""Pydantic schemas for round endpoints."""

from __future__ import annotations

import uuid  # noqa: TC003
from datetime import date, datetime  # noqa: TC003

from pydantic import BaseModel, Field

from app.db.models.round import RoundStatus  # noqa: TC001
from app.schemas.group import MessageResponse  # noqa: F401  (re-exported for convenience)


class RoundCreateRequest(BaseModel):
    deadline: date | None = None


class RoundUpdateRequest(BaseModel):
    deadline: date | None = None
    status: RoundStatus | None = None


class NominationCreateRequest(BaseModel):
    book_id: str
    book_title: str
    book_author: str | None = None
    book_cover_url: str | None = None
    book_hardcover_slug: str | None = None
    book_page_count: int | None = None
    pitch: str | None = Field(default=None, max_length=280)


class VoteCastRequest(BaseModel):
    nomination_id: uuid.UUID


class FinalizeRequest(BaseModel):
    deadline: date | None = None


class BookSummary(BaseModel):
    book_id: str
    title: str
    author: str | None
    cover_url: str | None
    page_count: int | None


class FinalizeResponse(BaseModel):
    book: BookSummary
    was_tiebreak: bool


# ── Response schemas ──────────────────────────────────────────────────────────


class NominationSummary(BaseModel):
    id: str
    book_id: str
    book_title: str
    book_author: str | None
    book_cover_url: str | None
    book_hardcover_slug: str | None = None
    book_page_count: int | None
    pitch: str | None
    user_id: str
    nominated_at: datetime
    vote_count: int = 0


class RoundListItem(BaseModel):
    id: str
    round_number: int
    book_title: str | None
    status: str
    deadline: date | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    nomination_count: int = 0


class RoundListResponse(BaseModel):
    rounds: list[RoundListItem]
    next_cursor: int | None


class RoundCreateResponse(BaseModel):
    id: str
    round_number: int
    status: str
    deadline: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RoundDetailResponse(BaseModel):
    id: str
    round_number: int
    book_id: str | None
    book_title: str | None
    book_author: str | None
    book_cover_url: str | None
    book_page_count: int | None
    status: str
    deadline: date | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    nominations: list[NominationSummary]
    tiebreak_info: dict | None = None
