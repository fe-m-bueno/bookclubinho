"""BookReview model — stub mínimo para suportar o check de finish_round.

Campos adicionais (texto de review, booleans chorou/amou, etc.)
serão adicionados na issue de BookReview completo.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class BookReview(CreatedAtMixin, Base):
    __tablename__ = "book_reviews"
    __table_args__ = (
        UniqueConstraint("round_id", "user_id", name="uq_book_reviews_round_user"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_book_reviews_rating"),
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
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    round: Mapped["Round"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
