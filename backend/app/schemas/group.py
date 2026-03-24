"""Pydantic schemas for group endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003
from typing import Literal

from pydantic import BaseModel, field_validator

# ── Enriched list schemas ─────────────────────────────────────────────────────


class RoundSummary(BaseModel):
    id: str
    round_number: int
    status: str
    book_title: str | None = None
    book_author: str | None = None
    book_cover_url: str | None = None
    book_page_count: int | None = None


class MyReadingProgress(BaseModel):
    current_page: int | None = None
    total_pages: int | None = None
    percentage: float


class LastMessagePreview(BaseModel):
    sender_display_name: str | None = None
    sender_avatar_url: str | None = None
    content_text: str | None = None
    content_type: str
    created_at: datetime


class MemberAvatar(BaseModel):
    user_id: str
    display_name: str | None = None
    avatar_url: str | None = None


# ── Validate / Join schemas ────────────────────────────────────────────────────


class GroupValidateResponse(BaseModel):
    valid: bool
    name: str | None = None
    photo_url: str | None = None
    member_count: int = 0

    model_config = {"from_attributes": True}


class GroupJoinRequest(BaseModel):
    invite_code: str

    @field_validator("invite_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 8:
            raise ValueError("Codigo deve ter 8 caracteres.")
        return v


class GroupJoinResponse(BaseModel):
    message: str
    group_id: str


# ── CRUD schemas ──────────────────────────────────────────────────────────────


class MemberSummary(BaseModel):
    user_id: str
    username: str | None
    display_name: str | None
    avatar_url: str | None
    role: str
    joined_at: datetime


class GroupCreateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    photo_url: str | None
    invite_code: str
    created_at: datetime


class GroupListItem(BaseModel):
    id: str
    name: str
    photo_url: str | None
    member_count: int
    members_preview: list[MemberAvatar] = []
    current_round: RoundSummary | None = None
    my_reading_progress: MyReadingProgress | None = None
    last_message_preview: LastMessagePreview | None = None
    last_activity_at: datetime | None = None


class GroupListResponse(BaseModel):
    groups: list[GroupListItem]


class GroupDetailResponse(BaseModel):
    id: str
    name: str
    description: str | None
    photo_url: str | None
    invite_code: str | None
    max_members: int
    member_count: int
    members: list[MemberSummary]
    current_user_id: str
    current_round: None = None
    created_at: datetime


class MessageResponse(BaseModel):
    message: str


class RegenerateCodeResponse(BaseModel):
    invite_code: str
    qr_url: str


class QrCodeResponse(BaseModel):
    qr_url: str


class MemberRoleUpdateRequest(BaseModel):
    role: Literal["admin", "member"]


class MemberRoleUpdateResponse(BaseModel):
    user_id: str
    role: Literal["admin", "member"]
    message: str
