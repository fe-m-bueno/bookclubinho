"""GroupMessage and MessageReaction models — group chat."""

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class ContentType(StrEnum):
    TEXT = "text"
    IMAGE = "image"
    GIF = "gif"
    VIDEO_LINK = "video_link"
    QUOTE = "quote"
    CHAPTER_MARKER = "chapter_marker"
    PAGE_MARKER = "page_marker"
    SYSTEM = "system"


class ReferenceType(StrEnum):
    CHAPTER = "chapter"
    PAGE = "page"
    QUOTE = "quote"


_CONTENT_TYPES = (
    "'text','image','gif','video_link','quote','chapter_marker','page_marker','system'"
)


class GroupMessage(CreatedAtMixin, Base):
    """A message in a group chat. Soft-deleted via is_deleted flag."""

    __tablename__ = "group_messages"
    __table_args__ = (
        CheckConstraint(
            f"content_type IN ({_CONTENT_TYPES})",
            name="ck_group_messages_content_type",
        ),
        CheckConstraint(
            "reference_type IS NULL OR reference_type IN ('chapter','page','quote')",
            name="ck_group_messages_reference_type",
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
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_rich_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_spoiler: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    spoiler_chapter: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parent_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_messages.id"),
        nullable=True,
    )
    # updated_at is NULL until first edit — don't use TimestampMixin
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # is_deleted instead of is_active — don't use SoftDeleteMixin
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    # Auto-hidden after AUTO_HIDE_THRESHOLD unique reports; admins can un-hide
    is_hidden: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )

    group: Mapped["Group"] = relationship(lazy="raise")  # noqa: F821
    user: Mapped["User"] = relationship(lazy="raise", foreign_keys=[user_id])  # noqa: F821
    round: Mapped["Round | None"] = relationship(lazy="raise")  # noqa: F821
    parent_message: Mapped["GroupMessage | None"] = relationship(
        lazy="raise",
        remote_side="GroupMessage.id",
        foreign_keys=[parent_message_id],
        back_populates="replies",
    )
    replies: Mapped[list["GroupMessage"]] = relationship(
        lazy="raise",
        back_populates="parent_message",
        foreign_keys=[parent_message_id],
    )
    reactions: Mapped[list["MessageReaction"]] = relationship(
        lazy="raise",
        back_populates="message",
    )


class MessageReaction(CreatedAtMixin, Base):
    """An emoji reaction on a group message. Immutable after creation."""

    __tablename__ = "message_reactions"
    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "user_id",
            "emoji",
            name="uq_message_reactions_msg_user_emoji",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("group_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    emoji: Mapped[str] = mapped_column(Text, nullable=False)

    message: Mapped["GroupMessage"] = relationship(lazy="raise", back_populates="reactions")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
