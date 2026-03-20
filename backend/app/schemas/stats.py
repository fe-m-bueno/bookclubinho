"""Schemas para endpoints de stats."""

from __future__ import annotations

from pydantic import BaseModel


class GenreBreakdown(BaseModel):
    genre: str
    count: int


class MemberLeaderboardEntry(BaseModel):
    user_id: str
    username: str | None
    display_name: str | None
    avatar_url: str | None
    books_finished: int
    avg_rating: float | None
    current_streak: int
    reading_time_minutes: int
    reviews_count: int
    badges_count: int


class RatingDistribution(BaseModel):
    stars: int
    count: int


class EmotionalStats(BaseModel):
    total_reviews: int
    cried_count: int
    loved_it_count: int
    felt_aroused_count: int
    found_heavy_count: int
    wants_more_count: int


class GroupStatsResponse(BaseModel):
    total_books_read: int
    total_pages_read: int
    average_rating: float | None
    total_reading_time_minutes: int
    books_per_genre: list[GenreBreakdown]
    member_leaderboard: list[MemberLeaderboardEntry]
    rating_distribution: list[RatingDistribution]
    emotional_stats: EmotionalStats


class RoundStatsResponse(BaseModel):
    round_id: str
    book_title: str | None
    book_author: str | None
    total_pages: int | None
    average_rating: float | None
    reviews_count: int
    total_reading_time_minutes: int
    members_finished: int
    members_total: int


class UserStatsResponse(BaseModel):
    total_books: int
    total_reading_time_minutes: int
    genres_read: list[GenreBreakdown]
    longest_streak: int
    badges_count: int
