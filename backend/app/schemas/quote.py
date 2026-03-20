"""Schemas para endpoints de Hall of Quotes."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import BaseModel, Field


class QuoteCreateRequest(BaseModel):
    quote_text: str = Field(min_length=1, max_length=2000)
    page_reference: str | None = Field(default=None, max_length=50)
    round_id: str | None = None


class QuoteResponse(BaseModel):
    id: str
    user_id: str
    username: str | None
    display_name: str | None
    avatar_url: str | None
    quote_text: str
    page_reference: str | None
    book_title: str
    book_author: str | None
    round_id: str | None
    vote_count: int
    did_i_vote: bool
    created_at: datetime


class QuoteListResponse(BaseModel):
    quotes: list[QuoteResponse]
    next_cursor: str | None
