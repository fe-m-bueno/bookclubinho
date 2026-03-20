"""Schemas para shelf pública do grupo."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import BaseModel


class ShelfBookResponse(BaseModel):
    book_title: str
    book_author: str | None
    book_cover_url: str | None
    page_count: int | None
    genres: list[str]
    average_rating: float | None
    review_count: int
    started_at: datetime | None
    finished_at: datetime | None
    top_oneliners: list[str]


class ShelfResponse(BaseModel):
    group_name: str
    group_photo_url: str | None
    books: list[ShelfBookResponse]
