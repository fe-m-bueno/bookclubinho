"""ReadingProgress model — append-only snapshots of user reading progress."""

import uuid

from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class ReadingProgress(CreatedAtMixin, Base):
    """Immutable progress snapshot — each update is a new INSERT, never UPDATE."""

    __tablename__ = "reading_progress"
    __table_args__ = (
        CheckConstraint("current_page >= 0", name="ck_reading_progress_page_non_negative"),
        CheckConstraint(
            "percentage >= 0 AND percentage <= 100",
            name="ck_reading_progress_percentage_range",
        ),
        CheckConstraint(
            "progress_type IN ('page', 'chapter', 'percentage', 'finished')",
            name="ck_reading_progress_progress_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    current_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentage: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        server_default=text("0.0"),
        default=0.0,
    )
    progress_type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default="page",
        default="page",
    )
    total_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # No updated_at — this model is immutable by design (append-only snapshots)

    round: Mapped["Round"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
