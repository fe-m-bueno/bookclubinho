"""Pydantic schemas for auth endpoints."""

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.password import Password


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    display_name: str

    @field_validator("display_name")
    @classmethod
    def display_name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name não pode ser vazio.")
        return v


class RegisterResponse(BaseModel):
    message: str


class VerifyEmailResponse(BaseModel):
    message: str


class LoginResponse(BaseModel):
    message: str


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkResponse(BaseModel):
    message: str


class LogoutResponse(BaseModel):
    message: str


class RefreshResponse(BaseModel):
    message: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str
