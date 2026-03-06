"""Pydantic schemas for group endpoints."""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class GroupValidateResponse(BaseModel):
    name: str
    photo_url: str | None
    member_count: int

    model_config = {"from_attributes": True}


class GroupJoinRequest(BaseModel):
    invite_code: str

    @field_validator("invite_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 8:
            raise ValueError("Código deve ter 8 caracteres.")
        return v


class GroupJoinResponse(BaseModel):
    message: str
    group_id: str
