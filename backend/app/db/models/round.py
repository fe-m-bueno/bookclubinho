import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class RoundStatus(StrEnum):
    NOMINATING = "nominating"
    VOTING = "voting"
    READING = "reading"
    REVIEWING = "reviewing"
    FINISHED = "finished"


class Round(CreatedAtMixin, Base):
    __tablename__ = "rounds"
    __table_args__ = (
        UniqueConstraint("group_id", "round_number", name="uq_rounds_group_round_number"),
        CheckConstraint(
            f"status IN ('{RoundStatus.NOMINATING}', '{RoundStatus.VOTING}', "
            f"'{RoundStatus.READING}', '{RoundStatus.REVIEWING}', '{RoundStatus.FINISHED}')",
            name="ck_rounds_status",
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
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    book_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    book_genres: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=RoundStatus.NOMINATING,
        default=RoundStatus.NOMINATING,
    )
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    tiebreak_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    group: Mapped["Group"] = relationship(back_populates="rounds", lazy="raise")  # noqa: F821
    creator: Mapped["User"] = relationship(lazy="raise", foreign_keys=[created_by])  # noqa: F821
    nominations: Mapped[list["RoundNomination"]] = relationship(back_populates="round", lazy="raise")


class RoundNomination(Base):
    __tablename__ = "round_nominations"
    __table_args__ = (
        UniqueConstraint("round_id", "user_id", "book_id", name="uq_round_nominations_round_user_book"),
        CheckConstraint(
            "pitch IS NULL OR char_length(pitch) <= 280",
            name="ck_round_nominations_pitch_length",
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
    book_id: Mapped[str] = mapped_column(Text, nullable=False)
    book_title: Mapped[str] = mapped_column(Text, nullable=False)
    book_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    book_hardcover_slug: Mapped[str | None] = mapped_column(Text, nullable=True)
    pitch: Mapped[str | None] = mapped_column(Text, nullable=True)
    nominated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    round: Mapped["Round"] = relationship(back_populates="nominations", lazy="raise")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
    votes: Mapped[list["RoundVote"]] = relationship(back_populates="nomination", lazy="raise")


class RoundVote(Base):
    __tablename__ = "round_votes"
    __table_args__ = (UniqueConstraint("round_id", "user_id", name="uq_round_votes_round_user"),)

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
    nomination_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("round_nominations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    voted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    round: Mapped["Round"] = relationship(lazy="raise")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
    nomination: Mapped["RoundNomination"] = relationship(back_populates="votes", lazy="raise")
