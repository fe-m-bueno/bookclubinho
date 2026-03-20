"""Badge checker — award badges triggered by user events.

Runs as a FastAPI BackgroundTask. Opens its own DB session to avoid
using the already-committed request session.
"""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from redis.exceptions import RedisError
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.redis import get_redis
from app.db.engine import AsyncSessionLocal
from app.db.models.badge import Badge, UserBadge
from app.db.models.book_review import BookReview
from app.db.models.group import Group
from app.db.models.message import GroupMessage
from app.db.models.reading_progress import ReadingProgress
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round
from app.db.models.user import User

logger = structlog.get_logger(__name__)

# Event type → badge slugs to check
_EVENT_BADGES: dict[str, list[str]] = {
    "book_finished": ["first_blood", "bookworm", "speed_reader", "variety"],
    "review_submitted": ["reviewer", "crybaby", "hot_take", "romantic"],
    "message_sent": ["social_butterfly"],
    "streak_updated": ["streak_7", "streak_30", "streak_100"],
    "session_stopped": ["marathon", "night_owl"],
    "group_created": ["founder"],
}


async def check_and_award_badges(
    user_id: str,
    event_type: str,
    context: dict[str, str],
) -> None:
    """Check and award applicable badges for a user event.

    This function opens its own DB session with proper RLS setup.
    """
    slugs_to_check = _EVENT_BADGES.get(event_type, [])
    if not slugs_to_check:
        return

    try:
        async with AsyncSessionLocal() as db:
            try:
                # Set RLS context
                uid = uuid.UUID(user_id)
                await db.execute(text(f"SET LOCAL app.current_user_id = '{uid}'"))
                for slug in slugs_to_check:
                    try:
                        await _check_and_award(db, uid, slug, context)
                    except Exception:
                        logger.exception(
                            "badge_check_failed",
                            user_id=user_id,
                            slug=slug,
                        )

                await db.commit()
            except Exception:
                await db.rollback()
                raise
    except Exception:
        logger.exception("badge_checker_session_failed", user_id=user_id)


async def _check_and_award(
    db: Any,
    user_id: uuid.UUID,
    slug: str,
    context: dict[str, str],
) -> None:
    """Check condition for a single badge and award if met."""
    checker = _CHECKERS.get(slug)
    if checker is None:
        return

    condition_met, award_context = await checker(db, user_id, context)
    if not condition_met:
        return

    group_id = uuid.UUID(award_context["group_id"]) if award_context.get("group_id") else None
    round_id = uuid.UUID(award_context["round_id"]) if award_context.get("round_id") else None

    # Get badge id
    badge_result = await db.execute(select(Badge.id).where(Badge.slug == slug))
    badge_id = badge_result.scalar_one_or_none()
    if badge_id is None:
        return

    # Insert with ON CONFLICT DO NOTHING for idempotency
    await db.execute(
        pg_insert(UserBadge)
        .values(
            user_id=user_id,
            badge_id=badge_id,
            group_id=group_id,
            round_id=round_id,
        )
        .on_conflict_do_nothing()
    )
    logger.info("badge_awarded", user_id=str(user_id), slug=slug)

    # Emit event to group stream if group context available
    if group_id:
        await _emit_badge_event(group_id, user_id, slug)


async def _emit_badge_event(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    slug: str,
) -> None:
    """Fire badge_earned event to the group's events Redis stream."""
    try:
        redis = get_redis()
        stream_key = f"bookclub:group:{group_id}:events"
        await redis.xadd(
            stream_key,
            {
                "type": "badge_earned",
                "user_id": str(user_id),
                "badge_slug": slug,
            },
            maxlen=10000,
            approximate=True,
        )
    except RedisError:
        logger.warning("badge_event_emit_failed", group_id=str(group_id))


# ── Individual badge checkers ─────────────────────────────────────────────────
# Each returns (condition_met: bool, context_for_award: dict)


async def _check_first_blood(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    round_id_str = ctx.get("round_id")
    if not round_id_str:
        return False, {}
    round_id = uuid.UUID(round_id_str)

    # Did this user finish (percentage >= 100)?
    my_progress = await db.execute(
        select(ReadingProgress)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
            ReadingProgress.percentage >= 100.0,
        )
        .limit(1)
    )
    if not my_progress.scalar_one_or_none():
        return False, {}

    # Is this user the FIRST to finish?
    first_finisher = await db.execute(
        select(ReadingProgress.user_id)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.percentage >= 100.0,
        )
        .order_by(ReadingProgress.created_at.asc())
        .limit(1)
    )
    first_uid = first_finisher.scalar_one_or_none()
    if first_uid != user_id:
        return False, {}

    return True, ctx


def _make_review_count_checker(threshold: int) -> Any:
    async def _check(db: Any, user_id: uuid.UUID, ctx: dict[str, str]) -> tuple[bool, dict]:
        result = await db.execute(
            select(func.count(BookReview.id)).where(BookReview.user_id == user_id)
        )
        count = int(result.scalar_one() or 0)
        return count >= threshold, {}

    return _check


_check_bookworm = _make_review_count_checker(5)


async def _check_speed_reader(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    round_id_str = ctx.get("round_id")
    if not round_id_str:
        return False, {}
    round_id = uuid.UUID(round_id_str)

    round_result = await db.execute(select(Round).where(Round.id == round_id))
    round_ = round_result.scalar_one_or_none()
    if not round_ or not round_.started_at:
        return False, {}

    # Check if user has a finished progress entry
    finished_progress = await db.execute(
        select(ReadingProgress.created_at)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
            ReadingProgress.percentage >= 100.0,
        )
        .order_by(ReadingProgress.created_at.asc())
        .limit(1)
    )
    finished_at = finished_progress.scalar_one_or_none()
    if not finished_at:
        return False, {}

    days_taken = (finished_at - round_.started_at).days
    return days_taken < 7, ctx


async def _check_variety(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    rounds_result = await db.execute(
        select(Round.book_genres).where(
            Round.id.in_(
                select(BookReview.round_id).where(BookReview.user_id == user_id)
            ),
            Round.book_genres.isnot(None),
        )
    )
    genres: set[str] = set()
    for (genre_list,) in rounds_result.all():
        genres.update(genre_list or [])
    return len(genres) >= 5, {}


_check_reviewer = _make_review_count_checker(10)


async def _check_crybaby(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    result = await db.execute(
        select(func.count(BookReview.id)).where(
            BookReview.user_id == user_id,
            BookReview.cried.is_(True),
        )
    )
    count = int(result.scalar_one() or 0)
    return count >= 3, {}


async def _check_hot_take(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    round_id_str = ctx.get("round_id")
    group_id_str = ctx.get("group_id")
    if not round_id_str or not group_id_str:
        return False, {}
    round_id = uuid.UUID(round_id_str)

    # User's own rating
    my_review_result = await db.execute(
        select(BookReview.star_rating).where(
            BookReview.round_id == round_id,
            BookReview.user_id == user_id,
        )
    )
    my_rating = my_review_result.scalar_one_or_none()
    if my_rating is None or my_rating > 1:
        return False, {}

    # Group average (excluding this user)
    group_avg_result = await db.execute(
        select(func.avg(BookReview.star_rating)).where(
            BookReview.round_id == round_id,
            BookReview.user_id != user_id,
        )
    )
    group_avg = group_avg_result.scalar_one_or_none()
    if group_avg is None or float(group_avg) < 4.0:
        return False, {}

    return True, ctx


async def _check_romantic(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    result = await db.execute(
        select(func.count(BookReview.id)).where(
            BookReview.user_id == user_id,
            BookReview.loved_it.is_(True),
        )
    )
    count = int(result.scalar_one() or 0)
    return count >= 5, {}


async def _check_social_butterfly(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    group_id_str = ctx.get("group_id")
    if not group_id_str:
        return False, {}
    group_id = uuid.UUID(group_id_str)

    result = await db.execute(
        select(func.count(GroupMessage.id)).where(
            GroupMessage.user_id == user_id,
            GroupMessage.group_id == group_id,
            GroupMessage.is_deleted.is_(False),
        )
    )
    count = int(result.scalar_one() or 0)
    return count >= 100, ctx


def _make_streak_checker(threshold: int) -> Any:
    async def _check(db: Any, user_id: uuid.UUID, ctx: dict[str, str]) -> tuple[bool, dict]:
        user_result = await db.execute(select(User.streak_current).where(User.id == user_id))
        streak = user_result.scalar_one_or_none() or 0
        return streak >= threshold, {}

    return _check


_check_streak_7 = _make_streak_checker(7)
_check_streak_30 = _make_streak_checker(30)
_check_streak_100 = _make_streak_checker(100)


async def _check_marathon(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    duration_str = ctx.get("duration_minutes")
    if duration_str and int(duration_str) >= 120:
        return True, ctx
    # Also check historical max
    result = await db.execute(
        select(func.max(ReadingSession.duration_minutes)).where(
            ReadingSession.user_id == user_id
        )
    )
    max_duration = result.scalar_one_or_none() or 0
    return max_duration >= 120, ctx


async def _check_night_owl(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    # Count sessions started between midnight and 5am (UTC, simplified)
    result = await db.execute(
        select(func.count(ReadingSession.id)).where(
            ReadingSession.user_id == user_id,
            func.extract("hour", ReadingSession.started_at) >= 0,
            func.extract("hour", ReadingSession.started_at) < 5,
        )
    )
    count = int(result.scalar_one() or 0)
    return count >= 5, {}


async def _check_founder(
    db: Any, user_id: uuid.UUID, ctx: dict[str, str]
) -> tuple[bool, dict]:
    result = await db.execute(
        select(func.count(Group.id)).where(
            Group.created_by == user_id,
            Group.is_active.is_(True),
        )
    )
    count = int(result.scalar_one() or 0)
    return count >= 1, ctx


# ── Registry ──────────────────────────────────────────────────────────────────
_CHECKERS: dict[str, Any] = {
    "first_blood": _check_first_blood,
    "bookworm": _check_bookworm,
    "speed_reader": _check_speed_reader,
    "variety": _check_variety,
    "reviewer": _check_reviewer,
    "crybaby": _check_crybaby,
    "hot_take": _check_hot_take,
    "romantic": _check_romantic,
    "social_butterfly": _check_social_butterfly,
    "streak_7": _check_streak_7,
    "streak_30": _check_streak_30,
    "streak_100": _check_streak_100,
    "marathon": _check_marathon,
    "night_owl": _check_night_owl,
    "founder": _check_founder,
}
