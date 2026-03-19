"""ReadingSession model — timer sessions for tracking active reading time."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class ReadingSession(CreatedAtMixin, Base):
    """A timed reading session. Updated exactly once to set ended_at/duration_minutes."""

    __tablename__ = "reading_sessions"

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
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    round: Mapped["Round"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
