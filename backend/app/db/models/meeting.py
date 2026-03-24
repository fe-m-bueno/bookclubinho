"""Meeting and MeetingRsvp models — group meetings with RSVP."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import TimestampMixin


class MeetingType(StrEnum):
    IN_PERSON = "in_person"
    VIRTUAL = "virtual"
    HYBRID = "hybrid"


class RsvpStatus(StrEnum):
    GOING = "going"
    MAYBE = "maybe"
    NOT_GOING = "not_going"
    PENDING = "pending"


_MEETING_TYPES = "'in_person','virtual','hybrid'"
_RSVP_STATUSES = "'going','maybe','not_going','pending'"


class Meeting(TimestampMixin, Base):
    """A scheduled meeting for a book club group."""

    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint(
            f"meeting_type IN ({_MEETING_TYPES})",
            name="ck_meetings_meeting_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    round_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rounds.id"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    meeting_type: Mapped[str] = mapped_column(Text, nullable=False)
    virtual_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"), default=60)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    group: Mapped["Group"] = relationship(lazy="raise")  # noqa: F821
    round: Mapped["Round | None"] = relationship(lazy="raise")  # noqa: F821
    creator: Mapped["User"] = relationship(lazy="raise", foreign_keys=[created_by])  # noqa: F821
    rsvps: Mapped[list["MeetingRsvp"]] = relationship(
        lazy="raise",
        back_populates="meeting",
        cascade="all, delete-orphan",
    )


class MeetingRsvp(Base):
    """RSVP for a meeting. One per user per meeting."""

    __tablename__ = "meeting_rsvps"
    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_meeting_rsvps_meeting_user"),
        CheckConstraint(
            f"status IN ({_RSVP_STATUSES})",
            name="ck_meeting_rsvps_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=RsvpStatus.PENDING,
        default=RsvpStatus.PENDING,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    meeting: Mapped["Meeting"] = relationship(lazy="raise", back_populates="rsvps")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
