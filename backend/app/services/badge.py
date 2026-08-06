"""Badge service — listing, catalog, and progress queries."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.badge import Badge, UserBadge
from app.db.models.group import Group, GroupMember
from app.db.models.round import Round
from app.db.models.user import User
from app.services.badge_checker import BADGES

logger = structlog.get_logger(__name__)


class BadgeError(ServiceError):
    """Raised when badge operations fail."""


async def get_my_badges(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, list[dict[str, Any]]]:
    """Return user's earned badges grouped by category."""
    # Scalar subqueries for group_name and book_title — avoids multi-ORM join
    # complexity with RLS on groups/rounds tables.
    group_name_sq = select(Group.name).where(Group.id == UserBadge.group_id).scalar_subquery()
    book_title_sq = select(Round.book_title).where(Round.id == UserBadge.round_id).scalar_subquery()

    # Start from Badge (visible to all authenticated users) and join UserBadge
    # (RLS restricts to current user). This mirrors the pattern used in
    # get_public_profile which is known to work correctly.
    result = await db.execute(
        select(
            Badge.slug,
            Badge.name,
            Badge.description,
            Badge.emoji,
            Badge.category,
            UserBadge.earned_at,
            group_name_sq.label("group_name"),
            book_title_sq.label("book_title"),
        )
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.desc())
    )
    rows = result.all()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        entry = {
            "slug": row.slug,
            "name": row.name,
            "description": row.description,
            "emoji": row.emoji,
            "category": row.category,
            "earned_at": row.earned_at,
            "group_name": row.group_name,
            "book_title": row.book_title,
        }
        grouped.setdefault(row.category, []).append(entry)

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

    spec = BADGES.get(slug)
    if spec is None:
        # Badge no catálogo mas sem regra registrada — nada a medir.
        return {
            "slug": badge.slug,
            "name": badge.name,
            "emoji": badge.emoji,
            "current": 0,
            "target": 1,
            "percentage": 0.0,
        }

    # Mesma medição que decide o award (app.services.badge_checker.BADGES),
    # apenas truncada no alvo — não há segunda cópia da regra aqui.
    current = min(await spec.measure(db, user_id, {}), spec.target)
    pct = min(100.0, round(current / spec.target * 100, 1)) if spec.target > 0 else 100.0

    return {
        "slug": badge.slug,
        "name": badge.name,
        "emoji": badge.emoji,
        "current": current,
        "target": spec.target,
        "percentage": pct,
    }


async def get_recent_badges(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Return user's most recently earned badges (flat list, not grouped)."""
    group_name_sq = select(Group.name).where(Group.id == UserBadge.group_id).scalar_subquery()
    book_title_sq = select(Round.book_title).where(Round.id == UserBadge.round_id).scalar_subquery()

    result = await db.execute(
        select(
            Badge.slug,
            Badge.name,
            Badge.description,
            Badge.emoji,
            Badge.category,
            UserBadge.earned_at,
            group_name_sq.label("group_name"),
            book_title_sq.label("book_title"),
        )
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "slug": row.slug,
            "name": row.name,
            "description": row.description,
            "emoji": row.emoji,
            "category": row.category,
            "earned_at": row.earned_at,
            "group_name": row.group_name,
            "book_title": row.book_title,
        }
        for row in rows
    ]
