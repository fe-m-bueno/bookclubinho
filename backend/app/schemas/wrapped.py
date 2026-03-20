"""Schemas para endpoints de wrapped anual."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MemberInfo(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class MemberSuperlative(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    title: str
    emoji: str
    stat_label: str
    stat_value: str


class HighestRatedBook(BaseModel):
    title: str
    cover_url: str | None = None
    author: str | None = None
    avg_rating: float


class FunniestOneliner(BaseModel):
    text: str
    author_username: str
    author_display_name: str | None = None
    author_avatar_url: str | None = None
    vote_count: int


class MostEmotionalBook(BaseModel):
    title: str
    cover_url: str | None = None
    author: str | None = None
    cried_percentage: float


class GenreBreakdownItem(BaseModel):
    genre: str
    count: int
    percentage: float


class EmotionalStats(BaseModel):
    total_reviews: int
    cried_count: int
    loved_it_count: int
    felt_aroused_count: int
    found_heavy_count: int
    wants_more_count: int


class WrappedData(BaseModel):
    year: int
    group_name: str
    group_photo_url: str | None = None
    total_books_read: int
    total_pages: int
    total_reading_hours: float
    genre_breakdown: list[GenreBreakdownItem]
    highest_rated_book: HighestRatedBook | None = None
    most_active_member: MemberInfo | None = None
    longest_streak_member: MemberInfo | None = None
    funniest_oneliner: FunniestOneliner | None = None
    most_emotional_book: MostEmotionalBook | None = None
    member_superlatives: list[MemberSuperlative]
    emotional_stats: EmotionalStats
    member_avatars: list[MemberInfo]


class WrappedResponse(BaseModel):
    group_id: str
    year: int
    data: WrappedData
    generated_at: datetime
    generated_by: str

    model_config = {"from_attributes": True}
