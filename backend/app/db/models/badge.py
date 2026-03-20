"""Badge e UserBadge models."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base


class BadgeCategory(StrEnum):
    READING = "reading"
    SOCIAL = "social"
    STREAK = "streak"
    ACHIEVEMENT = "achievement"
    FUN = "fun"


class Badge(Base):
    __tablename__ = "badges"
    __table_args__ = (
        CheckConstraint(
            "category IN ('reading','social','streak','achievement','fun')",
            name="ck_badges_category",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    emoji: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)


class UserBadge(Base):
    __tablename__ = "user_badges"
    # UNIQUE NULLS NOT DISTINCT constraint is defined in migration (not expressible in SA)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("badges.id"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    round_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rounds.id", ondelete="SET NULL"),
        nullable=True,
    )
    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
    badge: Mapped["Badge"] = relationship(lazy="raise")
    group: Mapped["Group | None"] = relationship(lazy="raise", foreign_keys=[group_id])  # noqa: F821
    round: Mapped["Round | None"] = relationship(lazy="raise", foreign_keys=[round_id])  # noqa: F821
