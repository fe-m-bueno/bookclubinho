"""Pydantic models para resultados da Hardcover GraphQL API."""

from __future__ import annotations

from pydantic import BaseModel


class BookResult(BaseModel):
    book_id: str
    title: str
    author: str
    cover_url: str | None
    slug: str
    description: str | None
    page_count: int | None


class BookDetail(BookResult):
    genres: list[str]
