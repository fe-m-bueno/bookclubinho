"""Badge service — listing, catalog, and progress queries."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import func, select

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.badge import Badge, UserBadge
from app.db.models.book_review import BookReview
from app.db.models.group import Group, GroupMember
from app.db.models.message import GroupMessage
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round
from app.db.models.user import User

logger = structlog.get_logger(__name__)

# slug → (target, description for progress endpoint)
_BADGE_TARGETS: dict[str, int] = {
    "bookworm": 5,
    "reviewer": 10,
    "crybaby": 3,
    "romantic": 5,
    "speed_reader": 1,
    "variety": 5,
    "social_butterfly": 100,
    "streak_7": 7,
    "streak_30": 30,
    "streak_100": 100,
    "marathon": 1,
    "night_owl": 5,
    "first_blood": 1,
    "quote_king": 1,
    "founder": 1,
    "hot_take": 1,
}


class BadgeError(ServiceError):
    """Raised when badge operations fail."""


async def get_my_badges(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, list[dict[str, Any]]]:
    """Return user's earned badges grouped by category."""
    result = await db.execute(
        select(UserBadge, Badge, Group, Round)
        .join(Badge, Badge.id == UserBadge.badge_id)
        .outerjoin(Group, Group.id == UserBadge.group_id)
        .outerjoin(Round, Round.id == UserBadge.round_id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.desc())
    )
    rows = result.all()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for user_badge, badge, group, round_ in rows:
        entry = {
            "slug": badge.slug,
            "name": badge.name,
            "description": badge.description,
            "emoji": badge.emoji,
            "category": badge.category,
            "earned_at": user_badge.earned_at,
            "group_name": group.name if group else None,
            "book_title": round_.book_title if round_ else None,
        }
        grouped.setdefault(badge.category, []).append(entry)

    return grouped


async def get_group_badges(
    db: AsyncSession,
    group_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Return badges earned in this group, grouped by member."""
    # Single query: members + their badges (if any)
    members_result = await db.execute(
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
        .order_by(User.display_name)
    )
    users = members_result.scalars().all()

    if not users:
        return []

    user_ids = [u.id for u in users]
    badges_result = await db.execute(
        select(UserBadge, Badge, Round)
        .join(Badge, Badge.id == UserBadge.badge_id)
        .outerjoin(Round, Round.id == UserBadge.round_id)
        .where(
            UserBadge.user_id.in_(user_ids),
            UserBadge.group_id == group_id,
        )
        .order_by(UserBadge.user_id, UserBadge.earned_at.desc())
    )
    badges_rows = badges_result.all()

    # Group badges by user_id
    badges_by_user: dict[uuid.UUID, list[dict[str, Any]]] = {u.id: [] for u in users}
    for user_badge, badge, round_ in badges_rows:
        badges_by_user[user_badge.user_id].append(
            {
                "slug": badge.slug,
                "name": badge.name,
                "description": badge.description,
                "emoji": badge.emoji,
                "category": badge.category,
                "earned_at": user_badge.earned_at,
                "group_name": None,
                "book_title": round_.book_title if round_ else None,
            }
        )

    return [
        {
            "user_id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "badges": badges_by_user[user.id],
        }
        for user in users
    ]


async def get_badge_catalog(db: AsyncSession) -> list[dict[str, Any]]:
    """Return all available badges."""
    result = await db.execute(select(Badge).order_by(Badge.category, Badge.name))
    badges = result.scalars().all()

    return [
        {
            "slug": b.slug,
            "name": b.name,
            "description": b.description,
            "emoji": b.emoji,
            "category": b.category,
            "earned_at": None,
            "group_name": None,
            "book_title": None,
        }
        for b in badges
    ]


async def get_badge_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    slug: str,
) -> dict[str, Any]:
    """Return progress toward a specific badge for the user."""
    badge_result = await db.execute(select(Badge).where(Badge.slug == slug))
    badge = badge_result.scalar_one_or_none()
    if badge is None:
        raise BadgeError("Badge não encontrado.", status_code=404)

    target = _BADGE_TARGETS.get(slug, 1)
    current = await _compute_badge_progress(db, user_id, slug)
    pct = min(100.0, round(current / target * 100, 1)) if target > 0 else 100.0

    return {
        "slug": badge.slug,
        "name": badge.name,
        "emoji": badge.emoji,
        "current": current,
        "target": target,
        "percentage": pct,
    }


async def _compute_badge_progress(
    db: AsyncSession,
    user_id: uuid.UUID,
    slug: str,
) -> int:
    """Compute current progress value for a badge."""
    if slug in ("bookworm", "reviewer"):
        result = await db.execute(
            select(func.count(BookReview.id)).where(BookReview.user_id == user_id)
        )
        return int(result.scalar_one() or 0)

    if slug == "crybaby":
        result = await db.execute(
            select(func.count(BookReview.id)).where(
                BookReview.user_id == user_id,
                BookReview.cried.is_(True),
            )
        )
        return int(result.scalar_one() or 0)

    if slug == "romantic":
        result = await db.execute(
            select(func.count(BookReview.id)).where(
                BookReview.user_id == user_id,
                BookReview.loved_it.is_(True),
            )
        )
        return int(result.scalar_one() or 0)

    if slug == "variety":
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
        return len(genres)

    if slug == "social_butterfly":
        # Max messages in a single group
        result = await db.execute(
            select(func.count(GroupMessage.id), GroupMessage.group_id)
            .where(
                GroupMessage.user_id == user_id,
                GroupMessage.is_deleted.is_(False),
            )
            .group_by(GroupMessage.group_id)
            .order_by(func.count(GroupMessage.id).desc())
            .limit(1)
        )
        row = result.one_or_none()
        return int(row[0]) if row else 0

    if slug in ("streak_7", "streak_30", "streak_100"):
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        return user.streak_current if user else 0

    if slug == "marathon":
        result = await db.execute(
            select(func.max(ReadingSession.duration_minutes)).where(
                ReadingSession.user_id == user_id
            )
        )
        return int(result.scalar_one() or 0)

    if slug == "night_owl":
        result = await db.execute(
            select(func.count(ReadingSession.id)).where(
                ReadingSession.user_id == user_id,
                func.extract("hour", ReadingSession.started_at) >= 0,
                func.extract("hour", ReadingSession.started_at) < 5,
            )
        )
        return int(result.scalar_one() or 0)

    if slug == "founder":
        result = await db.execute(
            select(func.count(Group.id)).where(
                Group.created_by == user_id, Group.is_active.is_(True)
            )
        )
        return int(result.scalar_one() or 0)

    # Badges with binary progress (0 or 1): first_blood, quote_king, speed_reader, hot_take
    already_earned = await db.execute(
        select(func.count(UserBadge.id))
        .join(Badge, Badge.id == UserBadge.badge_id)
        .where(UserBadge.user_id == user_id, Badge.slug == slug)
    )
    return int(already_earned.scalar_one() or 0)
