import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str | None = None  # null para SSO / magic link
    auth_provider: str = "local"
    username: str | None = None
    display_name: str | None = None
    timezone: str = "America/Sao_Paulo"


class UserUpdate(BaseModel):
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    status_text: str | None = None
    preferred_genres: list[str] | None = None
    timezone: str | None = None
    onboarding_completed: bool | None = None
    email_notifications: dict | None = None


class UserRead(BaseModel):
    """Dados completos do usuário — visível apenas para o próprio usuário."""

    id: uuid.UUID
    email: EmailStr
    username: str | None
    display_name: str | None
    avatar_url: str | None
    status_text: str | None
    auth_provider: str
    preferred_genres: list[str]
    onboarding_completed: bool
    email_notifications: dict
    streak_current: int
    streak_longest: int
    streak_last_update: date | None
    total_reading_time_minutes: int
    timezone: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Perfil público — seguro para expor a outros usuários.

    Exclui: email, hashed_password, hardcover_token_encrypted, email_notifications.
    """

    id: uuid.UUID
    username: str | None
    display_name: str | None
    avatar_url: str | None
    status_text: str | None
    preferred_genres: list[str] = Field(default_factory=list)
    streak_current: int
    streak_longest: int
    total_reading_time_minutes: int
    timezone: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
