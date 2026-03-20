"""Pydantic schemas for book review endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import BaseModel, Field


class ReviewCreateRequest(BaseModel):
    star_rating: int = Field(ge=0, le=5)
    cried: bool
    loved_it: bool
    felt_aroused: bool
    found_heavy: bool
    wants_more_from_author: bool
    sincere_review: str = Field(min_length=20, max_length=5000)
    funny_oneliner: str | None = Field(default=None, max_length=280)
    extra_thoughts: str | None = Field(default=None, max_length=5000)


class ReviewUpdateRequest(BaseModel):
    star_rating: int | None = Field(default=None, ge=0, le=5)
    cried: bool | None = None
    loved_it: bool | None = None
    felt_aroused: bool | None = None
    found_heavy: bool | None = None
    wants_more_from_author: bool | None = None
    # sincere_review is NOT NULL in DB — only accept str, never null
    sincere_review: str | None = Field(default=None, min_length=20, max_length=5000)
    # These are nullable in DB — str to update, None omitted via exclude_unset
    funny_oneliner: str | None = Field(default=None, max_length=280)
    extra_thoughts: str | None = Field(default=None, max_length=5000)


class ReviewUserSummary(BaseModel):
    user_id: str
    username: str
    display_name: str | None
    avatar_url: str | None


class ReviewResponse(BaseModel):
    id: str
    round_id: str
    user_id: str
    star_rating: int
    cried: bool
    loved_it: bool
    felt_aroused: bool
    found_heavy: bool
    wants_more_from_author: bool
    sincere_review: str
    funny_oneliner: str | None
    extra_thoughts: str | None
    completed_at: datetime
    created_at: datetime
    user: ReviewUserSummary


class ReviewStatsResponse(BaseModel):
    total_reviews: int
    avg_star_rating: float
    cried_count: int
    loved_it_count: int
    felt_aroused_count: int
    found_heavy_count: int
    wants_more_count: int
