"""HallOfQuote e QuoteVote models."""

import uuid

from sqlalchemy import ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class HallOfQuote(CreatedAtMixin, Base):
    __tablename__ = "hall_of_quotes"

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
        ForeignKey("rounds.id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    quote_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_title: Mapped[str] = mapped_column(Text, nullable=False)
    book_author: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    group: Mapped["Group"] = relationship(lazy="raise")  # noqa: F821
    round: Mapped["Round | None"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
    votes: Mapped[list["QuoteVote"]] = relationship(  # noqa: F821
        back_populates="quote", lazy="raise", cascade="all, delete-orphan"
    )


class QuoteVote(CreatedAtMixin, Base):
    __tablename__ = "quote_votes"
    __table_args__ = (UniqueConstraint("quote_id", "user_id", name="uq_quote_votes_quote_user"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("hall_of_quotes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Relationships
    quote: Mapped["HallOfQuote"] = relationship(back_populates="votes", lazy="raise")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
