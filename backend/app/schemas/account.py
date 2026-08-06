"""Pydantic schemas for account management (password/email change)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr

from app.schemas.password import Password


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: Password


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    current_password: str | None = None


class MessageResponse(BaseModel):
    message: str
