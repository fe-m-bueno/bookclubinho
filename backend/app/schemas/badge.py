"""Schemas para endpoints de badges."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from pydantic import BaseModel


class BadgeResponse(BaseModel):
    slug: str
    name: str
    description: str | None
    emoji: str | None
    category: str
    earned_at: datetime | None = None
    group_name: str | None = None
    book_title: str | None = None


class MemberBadgesEntry(BaseModel):
    user_id: str
    username: str | None
    display_name: str | None
    avatar_url: str | None
    badges: list[BadgeResponse]


class MyBadgesResponse(BaseModel):
    badges: dict[str, list[BadgeResponse]]


class GroupBadgesResponse(BaseModel):
    members: list[MemberBadgesEntry]


class BadgeCatalogResponse(BaseModel):
    badges: list[BadgeResponse]


class BadgeProgressResponse(BaseModel):
    slug: str
    name: str
    emoji: str | None
    current: int
    target: int
    percentage: float



class RecentBadgesResponse(BaseModel):
    badges: list[BadgeResponse]
