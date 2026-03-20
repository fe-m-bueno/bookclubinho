"""BookReview model — review completa com rating, booleans e textos."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import TimestampMixin


class BookReview(TimestampMixin, Base):
    __tablename__ = "book_reviews"
    __table_args__ = (
        UniqueConstraint("round_id", "user_id", name="uq_book_reviews_round_user"),
        CheckConstraint(
            "star_rating >= 0 AND star_rating <= 5",
            name="ck_book_reviews_star_rating",
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
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Rating
    star_rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    # Boolean flags
    cried: Mapped[bool] = mapped_column(Boolean, nullable=False)
    loved_it: Mapped[bool] = mapped_column(Boolean, nullable=False)
    felt_aroused: Mapped[bool] = mapped_column(Boolean, nullable=False)
    found_heavy: Mapped[bool] = mapped_column(Boolean, nullable=False)
    wants_more_from_author: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Text fields
    sincere_review: Mapped[str] = mapped_column(Text, nullable=False)
    funny_oneliner: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_thoughts: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    round: Mapped["Round"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
    group: Mapped["Group"] = relationship(lazy="raise")  # noqa: F821
