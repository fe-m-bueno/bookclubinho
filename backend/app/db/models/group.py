import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.engine import Base
from app.db.models.base import TimestampMixin


class Group(TimestampMixin, Base):
    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    invite_code: Mapped[str] = mapped_column(
        String(8), unique=True, nullable=False, index=True
    )
    max_members: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("8"), default=8
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    members: Mapped[list["GroupMember"]] = relationship(
        back_populates="group", lazy="raise"
    )
    creator: Mapped["User"] = relationship(  # noqa: F821
        lazy="raise", foreign_keys=[created_by]
    )


class GroupMember(TimestampMixin, Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("user_id", "group_id", name="uq_group_members_user_group"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="member", default="member"
    )

    group: Mapped["Group"] = relationship(back_populates="members", lazy="raise")
    user: Mapped["User"] = relationship(lazy="raise")  # noqa: F821
