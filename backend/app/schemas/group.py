"""Pydantic schemas for group endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003

from typing import Literal

from pydantic import BaseModel, field_validator


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
    current_round: None = None
    last_message_preview: None = None


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
