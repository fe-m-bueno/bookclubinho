import uuid
from datetime import date, datetime
from zoneinfo import available_timezones

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator

from app.schemas.onboarding import USERNAME_REGEX, VALID_GENRE_SLUGS

_VALID_TIMEZONES = frozenset(available_timezones())


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
    status_text: str | None = None
    preferred_genres: list[str] | None = None
    timezone: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not USERNAME_REGEX.match(v):
            raise ValueError(
                "Username deve começar com letra, ter 3-20 caracteres "
                "e conter apenas letras, números e _."
            )
        return v

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Nome deve ter pelo menos 2 caracteres.")
        if len(v) > 50:
            raise ValueError("Nome deve ter no máximo 50 caracteres.")
        return v

    @field_validator("status_text")
    @classmethod
    def validate_status_text(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Status deve ter no máximo 100 caracteres.")
        return v

    @field_validator("preferred_genres")
    @classmethod
    def validate_genres(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) < 1:
            raise ValueError("Selecione pelo menos 1 gênero.")
        if len(v) > 10:
            raise ValueError("Selecione no máximo 10 gêneros.")
        invalid = [s for s in v if s not in VALID_GENRE_SLUGS]
        if invalid:
            raise ValueError(f"Gêneros inválidos: {', '.join(invalid)}")
        return v

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in _VALID_TIMEZONES:
            raise ValueError(f"Timezone inválido: {v}")
        return v


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
    auto_sync_hardcover: bool = False
    # Read from ORM but excluded from serialized output — used only to derive hardcover_connected
    hardcover_token_encrypted: str | None = Field(None, exclude=True)

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[misc]
    @property
    def hardcover_connected(self) -> bool:
        """True when a Hardcover API token is stored for this user."""
        return self.hardcover_token_encrypted is not None


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


class BadgeSummary(BaseModel):
    slug: str
    emoji: str | None

    model_config = {"from_attributes": True}


class UserProfilePublic(UserPublic):
    """Perfil público enriquecido com stats."""

    total_books_finished: int = 0
    badges: list[BadgeSummary] = Field(default_factory=list)


class AvatarResponse(BaseModel):
    avatar_url: str


class SharedGroupSummary(BaseModel):
    id: uuid.UUID
    name: str
    photo_url: str | None = None
    member_count: int = 0

    model_config = {"from_attributes": True}


class UserProfilePublicEnriched(UserProfilePublic):
    """Perfil público enriquecido com grupos em comum (para viewers autenticados)."""

    shared_group_count: int = 0
