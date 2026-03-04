"""Pydantic schemas for auth endpoints."""

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A senha deve ter pelo menos 8 caracteres.")
        return v

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
