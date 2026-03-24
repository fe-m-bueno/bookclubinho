import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.engine import Base
from app.db.models.base import SoftDeleteMixin, TimestampMixin

_EMAIL_NOTIFICATIONS_DEFAULT = {
    "meetings": True,
    "invites": True,
    "auth": True,
    "approaching_end": False,
    "all_updates": False,
}

_EMAIL_NOTIFICATIONS_SERVER_DEFAULT = (
    '\'{"meetings": true, "invites": true, "auth": true, "approaching_end": false, "all_updates": false}\'::jsonb'
)


class User(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "auth_provider IN ('local', 'google', 'magic_link')",
            name="ck_users_auth_provider",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    username: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True, index=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    auth_provider: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="local",
        default="local",
    )
    preferred_genres: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        server_default=text("'{}'"),
        default=list,
    )
    onboarding_completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    email_notifications: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text(_EMAIL_NOTIFICATIONS_SERVER_DEFAULT),
        default=lambda: dict(_EMAIL_NOTIFICATIONS_DEFAULT),
    )
    streak_current: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    streak_longest: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    streak_last_update: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_reading_time_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
        default=0,
    )
    hardcover_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_sync_hardcover: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    timezone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        server_default="America/Sao_Paulo",
        default="America/Sao_Paulo",
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
