"""Pydantic schemas for account management (password/email change)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Nova senha deve ter pelo menos 8 caracteres.")
        return v


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str | None = None


class MessageResponse(BaseModel):
    message: str
