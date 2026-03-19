"""Reading progress service — append-only snapshots per user per round."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from redis.exceptions import RedisError
from sqlalchemy import func, select, update

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.group import GroupMember
from app.db.models.reading_progress import ReadingProgress
from app.db.models.round import Round, RoundStatus
from app.db.models.user import User
from app.services.round import verify_round_member

logger = structlog.get_logger(__name__)

_STREAK_MILESTONES = {7, 14, 30, 60, 100}


class ReadingProgressError(ServiceError):
    """Raised when reading progress validation fails."""


async def log_progress(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    current_page: int | None,
    percentage: float | None,
    progress_type: str | None = None,
    total_pages: int | None = None,
    note: str | None = None,
) -> ReadingProgress:
    """Insert a new progress snapshot. Round must be in READING status."""
    round_ = await verify_round_member(db, round_id, user_id)

    if round_.status != RoundStatus.READING:
        raise ReadingProgressError(
            "A rodada não está em fase de leitura.",
            status_code=409,
        )

    # Derive percentage from page when page_count is known
    page_count = total_pages or round_.book_page_count
    computed_pct: float
    if current_page is not None and page_count:
        computed_pct = min(100.0, (current_page / page_count) * 100.0)
    elif percentage is not None:
        computed_pct = percentage
    else:
        # current_page given but no page_count to compute from — keep at 0
        computed_pct = 0.0

    # Infer progress_type when not explicitly provided
    resolved_type: str
    if progress_type is not None:
        resolved_type = progress_type
    elif computed_pct >= 100.0:
        resolved_type = "finished"
    elif current_page is not None:
        resolved_type = "page"
    else:
        resolved_type = "percentage"

    progress = ReadingProgress(
        round_id=round_id,
        user_id=user_id,
        current_page=current_page,
        percentage=computed_pct,
        progress_type=resolved_type,
        total_pages=total_pages,
        note=note,
    )
    db.add(progress)
    await db.flush()
    await db.refresh(progress)

    logger.info(
        "progress_logged",
        round_id=str(round_id),
        user_id=str(user_id),
        pct=computed_pct,
        progress_type=resolved_type,
    )

    # Update streak and emit Redis events
    await _update_streak(db, user_id=user_id, round_=round_)
    await _emit_progress_events(
        round_=round_,
        user_id=user_id,
        percentage=computed_pct,
    )

    return progress


async def get_my_progress(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ReadingProgress | None:
    """Return the latest progress snapshot for this user in this round."""
    await verify_round_member(db, round_id, user_id)

    result = await db.execute(
        select(ReadingProgress)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
        )
        .order_by(ReadingProgress.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_group_progress(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[dict]:
    """Return the latest progress snapshot for every member of the group.

    Members with no progress yet are included with percentage=0 and updated_at=None.
    Returns a list of dicts compatible with MemberProgressSummary.
    """
    round_ = await verify_round_member(db, round_id, user_id)

    # Subquery: DISTINCT ON (user_id) — latest snapshot per user for this round.
    # SQLAlchemy renders DISTINCT ON when distinct() receives column arguments.
    latest_subq = (
        select(ReadingProgress)
        .where(ReadingProgress.round_id == round_id)
        .order_by(ReadingProgress.user_id, ReadingProgress.created_at.desc())
        .distinct(ReadingProgress.user_id)
    ).subquery("latest_progress")

    # Outer query: LEFT JOIN group_members with the latest snapshot subquery.
    stmt = (
        select(
            GroupMember.user_id,
            latest_subq.c.current_page,
            func.coalesce(latest_subq.c.percentage, 0.0).label("percentage"),
            latest_subq.c.created_at.label("updated_at"),
        )
        .select_from(GroupMember)
        .outerjoin(latest_subq, latest_subq.c.user_id == GroupMember.user_id)
        .where(GroupMember.group_id == round_.group_id)
        .order_by(func.coalesce(latest_subq.c.percentage, 0.0).desc())
    )

    result = await db.execute(stmt)
    rows = result.mappings().all()

    return [
        {
            "user_id": str(row["user_id"]),
            "current_page": row["current_page"],
            "percentage": float(row["percentage"]),
            "is_finished": float(row["percentage"]) >= 100.0,
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


async def cleanup_expired_streaks(db: AsyncSession) -> int:
    """Reset streak_current to 0 for users who missed yesterday.

    Returns the number of users affected.
    """
    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    result = await db.execute(
        update(User)
        .where(
            User.streak_last_update < yesterday,
            User.streak_current > 0,
        )
        .values(streak_current=0)
    )
    await db.flush()
    count = result.rowcount
    logger.info("streak_cleanup_done", users_reset=count)
    return count


# ── Private helpers ───────────────────────────────────────────────────────────


async def _update_streak(
    db: AsyncSession,
    user_id: "uuid.UUID",
    round_: Round,
) -> None:
    """Update the user's reading streak after logging progress.

    Fast-path: read streak_last_update and timezone without a lock.
    Only acquire FOR UPDATE when an actual update is needed.
    """
    # Fast non-locking read to check if we need to do anything
    fast_result = await db.execute(
        select(User.streak_last_update, User.timezone).where(User.id == user_id)
    )
    row = fast_result.one_or_none()
    if row is None:
        return

    try:
        tz: ZoneInfo | UTC = ZoneInfo(row.timezone)  # type: ignore[assignment]
    except ZoneInfoNotFoundError:
        tz = UTC  # type: ignore[assignment]
    today = datetime.now(tz).date()

    if row.streak_last_update == today:
        # Already counted today — skip the lock entirely
        return

    # Needs an update — acquire row lock and re-read to prevent races
    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one_or_none()
    if user is None:
        return

    # Recalculate today with the locked user's timezone (may differ from fast read)
    try:
        tz = ZoneInfo(user.timezone)  # type: ignore[assignment]
    except ZoneInfoNotFoundError:
        tz = UTC  # type: ignore[assignment]
    today = datetime.now(tz).date()

    if user.streak_last_update == today:
        # Another request already updated — nothing to do
        return

    if user.streak_last_update == today - timedelta(days=1):
        # Consecutive day — extend streak
        user.streak_current += 1
    else:
        # Missed at least one day (or first ever) — reset to 1
        user.streak_current = 1

    if user.streak_current > user.streak_longest:
        user.streak_longest = user.streak_current

    user.streak_last_update = today
    await db.flush()

    logger.info(
        "streak_updated",
        user_id=str(user_id),
        streak_current=user.streak_current,
        streak_last_update=str(today),
    )

    await _emit_streak_events(db=db, user=user, round_=round_)


async def _emit_progress_events(
    round_: Round,
    user_id: "uuid.UUID",
    percentage: float,
) -> None:
    """Emit progress_updated (and approaching_end if >= 80%) to the group stream."""
    try:
        redis = get_redis()
        stream_key = f"bookclub:group:{round_.group_id}:events"
        await redis.xadd(
            stream_key,
            {
                "type": "progress_updated",
                "round_id": str(round_.id),
                "user_id": str(user_id),
                "percentage": str(percentage),
            },
        )
        if percentage >= 80.0:
            await redis.xadd(
                stream_key,
                {
                    "type": "approaching_end",
                    "round_id": str(round_.id),
                    "user_id": str(user_id),
                    "percentage": str(percentage),
                },
            )
    except RedisError:
        logger.warning("redis_event_emission_failed", round_id=str(round_.id))


async def _emit_streak_events(
    db: AsyncSession,
    user: User,
    round_: Round,
) -> None:
    """Emit streak_updated (and streak_milestone when applicable) to all user groups."""
    try:
        redis = get_redis()
        # Fetch all active groups the user belongs to
        groups_result = await db.execute(
            select(GroupMember.group_id).where(GroupMember.user_id == user.id)
        )
        group_ids = [str(row[0]) for row in groups_result.all()]

        for group_id in group_ids:
            stream_key = f"bookclub:group:{group_id}:events"
            await redis.xadd(
                stream_key,
                {
                    "type": "streak_updated",
                    "user_id": str(user.id),
                    "streak_current": str(user.streak_current),
                    "streak_longest": str(user.streak_longest),
                },
            )
            if user.streak_current in _STREAK_MILESTONES:
                await redis.xadd(
                    stream_key,
                    {
                        "type": "streak_milestone",
                        "user_id": str(user.id),
                        "milestone": str(user.streak_current),
                    },
                )
    except RedisError:
        logger.warning("redis_streak_event_failed", user_id=str(user.id))


