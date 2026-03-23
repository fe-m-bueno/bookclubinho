"""Meeting service — group meetings and RSVPs."""

from __future__ import annotations

import uuid  # noqa: TC003
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Literal

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.meeting import MeetingCreateRequest, MeetingUpdateRequest

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.group import GroupMember, GroupRole
from app.db.models.meeting import Meeting, MeetingRsvp, RsvpStatus
from app.db.models.message import ContentType, GroupMessage
from app.security.sanitizer import sanitize
from app.services.group_helpers import (
    check_membership,
    emit_group_event,
    validate_round_in_group,
)

logger = structlog.get_logger(__name__)


class MeetingError(ServiceError):
    """Raised when meeting validation fails."""


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _verify_owner_or_admin(
    db: AsyncSession, meeting: Meeting, user_id: uuid.UUID
) -> None:
    """Raise 403 if user is not the creator or a group admin."""
    if meeting.created_by == user_id:
        return

    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == meeting.group_id,
            GroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None or member.role != GroupRole.ADMIN:
        raise MeetingError(
            "Apenas o criador ou administradores podem realizar esta ação.",
            status_code=403,
        )


async def _get_meeting_or_404(
    db: AsyncSession, meeting_id: uuid.UUID
) -> Meeting:
    """Load meeting or raise 404."""
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise MeetingError("Encontro não encontrado.", status_code=404)
    return meeting


async def _insert_system_message(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    text: str,
) -> None:
    """Insert a system message in the group chat."""
    msg = GroupMessage(
        group_id=group_id,
        user_id=user_id,
        content_type=ContentType.SYSTEM,
        content_text=text,
    )
    db.add(msg)
    await db.flush()

    await emit_group_event(
        group_id,
        {
            "type": "message_created",
            "message_id": str(msg.id),
            "user_id": str(user_id),
        },
    )


def _load_meeting_with_relations() -> list:
    """Return selectinload options for Meeting queries."""
    return [
        selectinload(Meeting.rsvps).selectinload(MeetingRsvp.user),
        selectinload(Meeting.creator),
    ]


# ── Service functions ─────────────────────────────────────────────────────────


async def list_upcoming_meetings(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 3,
) -> list[Meeting]:
    """List upcoming meetings across all groups the user belongs to."""
    now = datetime.now(UTC)

    stmt = (
        select(Meeting)
        .join(GroupMember, GroupMember.group_id == Meeting.group_id)
        .where(
            GroupMember.user_id == user_id,
            Meeting.scheduled_at > now,
        )
        .options(
            selectinload(Meeting.group),
            selectinload(Meeting.rsvps),
        )
        .order_by(Meeting.scheduled_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().unique().all())


async def create_meeting(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MeetingCreateRequest,
    creator_name: str,
) -> Meeting:
    """Create a meeting and auto-insert pending RSVPs for all group members."""
    if data.scheduled_at.tzinfo is None:
        data.scheduled_at = data.scheduled_at.replace(tzinfo=UTC)

    if data.scheduled_at <= datetime.now(UTC):
        raise MeetingError(
            "A data do encontro deve ser no futuro.", status_code=422
        )

    round_id: uuid.UUID | None = None
    if data.round_id:
        round_id = await validate_round_in_group(db, data.round_id, group_id)

    meeting = Meeting(
        group_id=group_id,
        round_id=round_id,
        title=sanitize(data.title),
        description=sanitize(data.description) if data.description else None,
        location=sanitize(data.location) if data.location else None,
        meeting_type=data.meeting_type,
        virtual_link=data.virtual_link,
        scheduled_at=data.scheduled_at,
        duration_minutes=data.duration_minutes,
        created_by=user_id,
    )
    db.add(meeting)
    await db.flush()

    # Auto-insert RSVPs for all group members
    members_result = await db.execute(
        select(GroupMember.user_id).where(GroupMember.group_id == group_id)
    )
    member_ids = list(members_result.scalars().all())

    for member_id in member_ids:
        rsvp = MeetingRsvp(
            meeting_id=meeting.id,
            user_id=member_id,
            status=RsvpStatus.GOING if member_id == user_id else RsvpStatus.PENDING,
            responded_at=datetime.now(UTC) if member_id == user_id else None,
        )
        db.add(rsvp)

    await db.flush()

    # Schedule email reminders (24h and 1h before meeting)
    try:
        _redis = get_redis()
        ts_24h = meeting.scheduled_at.timestamp() - 86400  # 24h before
        ts_1h = meeting.scheduled_at.timestamp() - 3600    # 1h before
        await _redis.zadd(
            "meeting_reminders",
            {
                f"{meeting.id}:24h": ts_24h,
                f"{meeting.id}:1h": ts_1h,
            },
        )
    except Exception:
        logger.warning("meeting_reminder_zadd_failed", meeting_id=str(meeting.id))

    # System message
    scheduled_str = data.scheduled_at.strftime("%d/%m/%Y às %H:%M")
    await _insert_system_message(
        db,
        group_id,
        user_id,
        f"📅 {creator_name} marcou um encontro: {meeting.title} — {scheduled_str}",
    )

    logger.info(
        "meeting_created", meeting_id=str(meeting.id), group_id=str(group_id)
    )
    return meeting


async def has_upcoming_soon(
    db: AsyncSession,
    group_id: uuid.UUID,
) -> bool:
    """Check if there's a meeting within the next 48h. Lightweight query."""
    now = datetime.now(UTC)
    in_48h = now + timedelta(hours=48)

    result = await db.execute(
        select(Meeting.id)
        .where(
            Meeting.group_id == group_id,
            Meeting.scheduled_at >= now,
            Meeting.scheduled_at <= in_48h,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def list_meetings(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    filter_type: Literal["upcoming", "past"] = "upcoming",
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[Meeting], str | None]:
    """List meetings with cursor-based pagination.

    Returns (meetings, next_cursor).
    """
    now = datetime.now(UTC)
    filters = [Meeting.group_id == group_id]

    if filter_type == "upcoming":
        filters.append(Meeting.scheduled_at >= now)
        order = Meeting.scheduled_at.asc()
        if cursor:
            try:
                cursor_dt = datetime.fromisoformat(cursor)
                filters.append(Meeting.scheduled_at > cursor_dt)
            except ValueError:
                pass
    else:
        filters.append(Meeting.scheduled_at < now)
        order = Meeting.scheduled_at.desc()
        if cursor:
            try:
                cursor_dt = datetime.fromisoformat(cursor)
                filters.append(Meeting.scheduled_at < cursor_dt)
            except ValueError:
                pass

    stmt = (
        select(Meeting)
        .options(*_load_meeting_with_relations())
        .where(*filters)
        .order_by(order)
        .limit(limit + 1)
    )
    result = await db.execute(stmt)
    meetings = list(result.scalars().all())

    next_cursor: str | None = None
    if len(meetings) > limit:
        meetings = meetings[:limit]
        next_cursor = meetings[-1].scheduled_at.isoformat()

    return meetings, next_cursor


async def get_meeting(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Meeting:
    """Get meeting detail with RSVPs. Verifies membership."""
    result = await db.execute(
        select(Meeting)
        .options(*_load_meeting_with_relations())
        .where(Meeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if meeting is None:
        raise MeetingError("Encontro não encontrado.", status_code=404)

    await check_membership(db, meeting.group_id, user_id)
    return meeting


async def update_meeting(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MeetingUpdateRequest,
) -> Meeting:
    """Update a meeting. Only creator or admin can update."""
    meeting = await _get_meeting_or_404(db, meeting_id)
    await check_membership(db, meeting.group_id, user_id)
    await _verify_owner_or_admin(db, meeting, user_id)

    if data.title is not None:
        meeting.title = sanitize(data.title)
    if data.description is not None:
        meeting.description = sanitize(data.description)
    if data.location is not None:
        meeting.location = sanitize(data.location)
    if data.meeting_type is not None:
        meeting.meeting_type = data.meeting_type
    if data.virtual_link is not None:
        meeting.virtual_link = data.virtual_link
    if data.scheduled_at is not None:
        scheduled = data.scheduled_at
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=UTC)
        if scheduled <= datetime.now(UTC):
            raise MeetingError(
                "A data do encontro deve ser no futuro.", status_code=422
            )
        meeting.scheduled_at = scheduled
    if data.duration_minutes is not None:
        meeting.duration_minutes = data.duration_minutes
    if data.round_id is not None:
        meeting.round_id = await validate_round_in_group(
            db, data.round_id, meeting.group_id
        )

    await db.flush()
    await db.refresh(meeting)

    logger.info("meeting_updated", meeting_id=str(meeting_id))
    return meeting


async def delete_meeting(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    user_name: str,
) -> uuid.UUID:
    """Delete a meeting. Only creator or admin. Returns group_id."""
    meeting = await _get_meeting_or_404(db, meeting_id)
    await check_membership(db, meeting.group_id, user_id)
    await _verify_owner_or_admin(db, meeting, user_id)

    group_id = meeting.group_id
    title = meeting.title

    await db.delete(meeting)
    await db.flush()

    # Remove pending reminders
    try:
        _redis = get_redis()
        await _redis.zrem("meeting_reminders", f"{meeting_id}:24h", f"{meeting_id}:1h")
    except Exception:
        logger.warning("meeting_reminder_zrem_failed", meeting_id=str(meeting_id))

    await _insert_system_message(
        db,
        group_id,
        user_id,
        f"📅 {user_name} cancelou o encontro: {title}",
    )

    logger.info("meeting_deleted", meeting_id=str(meeting_id), group_id=str(group_id))
    return group_id


async def update_rsvp(
    db: AsyncSession,
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str,
) -> MeetingRsvp:
    """Update RSVP status. Creates RSVP if user joined group after meeting creation."""
    meeting = await _get_meeting_or_404(db, meeting_id)
    await check_membership(db, meeting.group_id, user_id)

    result = await db.execute(
        select(MeetingRsvp).where(
            MeetingRsvp.meeting_id == meeting_id,
            MeetingRsvp.user_id == user_id,
        )
    )
    rsvp = result.scalar_one_or_none()

    if rsvp is None:
        rsvp = MeetingRsvp(
            meeting_id=meeting_id,
            user_id=user_id,
            status=status,
            responded_at=datetime.now(UTC),
        )
        db.add(rsvp)
    else:
        rsvp.status = status
        rsvp.responded_at = datetime.now(UTC)

    await db.flush()
    await db.refresh(rsvp)

    logger.info(
        "rsvp_updated",
        meeting_id=str(meeting_id),
        user_id=str(user_id),
        status=status,
    )
    return rsvp
