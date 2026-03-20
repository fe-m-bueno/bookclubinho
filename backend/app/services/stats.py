"""Stats service — aggregated statistics for groups, rounds and users."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import orjson
import structlog
from redis.exceptions import RedisError
from sqlalchemy import case, func, select

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.badge import UserBadge
from app.db.models.book_review import BookReview
from app.db.models.group import GroupMember
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round, RoundStatus
from app.db.models.user import User

logger = structlog.get_logger(__name__)

_GROUP_STATS_TTL = 3600  # 1 hora


class StatsError(ServiceError):
    """Raised when stats validation fails."""


def _tally_genres(genre_lists: list[list[str] | None]) -> list[dict]:
    """Count genre occurrences and return sorted list of {genre, count} dicts."""
    counts: dict[str, int] = {}
    for genres in genre_lists:
        for genre in (genres or []):
            counts[genre] = counts.get(genre, 0) + 1
    return [
        {"genre": g, "count": c}
        for g, c in sorted(counts.items(), key=lambda x: x[1], reverse=True)
    ]


def _bool_sum(col: object) -> object:
    """SQLAlchemy expression: SUM(CASE WHEN col IS TRUE THEN 1 ELSE 0 END)."""
    return func.sum(case((col.is_(True), 1), else_=0))  # type: ignore[attr-defined]


async def invalidate_group_stats(group_id: uuid.UUID) -> None:
    """Remove the group stats cache entry (call on round finish)."""
    try:
        redis = get_redis()
        await redis.delete(f"stats:group:{group_id}")
    except RedisError:
        logger.warning("stats_invalidate_failed", group_id=str(group_id))


async def get_group_stats(
    db: AsyncSession,
    group_id: uuid.UUID,
) -> dict[str, Any]:
    """Return aggregated stats for a group across all finished rounds.

    Result is cached in Redis for 1 hour.
    """
    redis = get_redis()
    cache_key = f"stats:group:{group_id}"

    try:
        cached = await redis.get(cache_key)
        if cached:
            return orjson.loads(cached)
    except RedisError:
        logger.warning("stats_cache_read_failed", group_id=str(group_id))

    result = await _compute_group_stats(db, group_id)

    try:
        await redis.set(cache_key, orjson.dumps(result), ex=_GROUP_STATS_TTL)
    except RedisError:
        logger.warning("stats_cache_write_failed", group_id=str(group_id))

    return result


async def _compute_group_stats(
    db: AsyncSession,
    group_id: uuid.UUID,
) -> dict[str, Any]:
    """Run the actual aggregation queries for group stats."""
    # ── Finished rounds ───────────────────────────────────────────────────────
    finished_rounds_stmt = select(Round).where(
        Round.group_id == group_id,
        Round.status == RoundStatus.FINISHED,
    )
    rounds_result = await db.execute(finished_rounds_stmt)
    finished_rounds = rounds_result.scalars().all()

    total_books_read = len(finished_rounds)
    total_pages_read = sum(r.book_page_count or 0 for r in finished_rounds)

    # ── Genre breakdown ───────────────────────────────────────────────────────
    books_per_genre = _tally_genres([r.book_genres for r in finished_rounds])

    # ── Average rating ────────────────────────────────────────────────────────
    avg_rating_result = await db.execute(
        select(func.avg(BookReview.star_rating)).where(BookReview.group_id == group_id)
    )
    avg_rating_raw = avg_rating_result.scalar_one_or_none()
    average_rating = float(avg_rating_raw) if avg_rating_raw is not None else None

    # ── Total reading time ────────────────────────────────────────────────────
    # Get all round_ids for this group
    round_ids = [r.id for r in finished_rounds]
    total_time_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
            ReadingSession.round_id.in_(round_ids)
        )
    )
    total_reading_time = int(total_time_result.scalar_one())

    # ── Member leaderboard ────────────────────────────────────────────────────
    members_result = await db.execute(
        select(GroupMember, User)
        .join(User, User.id == GroupMember.user_id)
        .where(GroupMember.group_id == group_id)
    )
    members_rows = members_result.all()

    leaderboard = []
    for _member, user in members_rows:
        # Count reviews (each review = 1 finished book in a round)
        member_reviews_result = await db.execute(
            select(
                func.count(BookReview.id).label("reviews_count"),
                func.avg(BookReview.star_rating).label("avg_rating"),
            ).where(
                BookReview.group_id == group_id,
                BookReview.user_id == user.id,
            )
        )
        member_review_row = member_reviews_result.one()
        reviews_count = int(member_review_row.reviews_count or 0)
        avg_r = float(member_review_row.avg_rating) if member_review_row.avg_rating else None

        # Reading time for this member in this group
        member_time_result = await db.execute(
            select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
                ReadingSession.user_id == user.id,
                ReadingSession.round_id.in_(round_ids),
            )
        )
        member_time = int(member_time_result.scalar_one())

        # Badge count (group-specific + global)
        member_badges_result = await db.execute(
            select(func.count(UserBadge.id)).where(
                UserBadge.user_id == user.id,
            )
        )
        badges_count = int(member_badges_result.scalar_one() or 0)

        leaderboard.append(
            {
                "user_id": str(user.id),
                "username": user.username,
                "display_name": user.display_name,
                "avatar_url": user.avatar_url,
                "books_finished": reviews_count,
                "avg_rating": avg_r,
                "current_streak": user.streak_current,
                "reading_time_minutes": member_time,
                "reviews_count": reviews_count,
                "badges_count": badges_count,
            }
        )

    leaderboard.sort(key=lambda x: x["books_finished"], reverse=True)

    # ── Rating distribution ───────────────────────────────────────────────────
    ratings_result = await db.execute(
        select(BookReview.star_rating, func.count(BookReview.id).label("cnt"))
        .where(BookReview.group_id == group_id)
        .group_by(BookReview.star_rating)
    )
    star_counts: dict[int, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for row in ratings_result.all():
        if row.star_rating in star_counts:
            star_counts[row.star_rating] = int(row.cnt)
    rating_distribution = [
        {"stars": star, "count": count}
        for star, count in sorted(star_counts.items())
    ]

    # ── Emotional stats ───────────────────────────────────────────────────────
    emotional_result = await db.execute(
        select(
            func.count(BookReview.id).label("total_reviews"),
            _bool_sum(BookReview.cried).label("cried_count"),
            _bool_sum(BookReview.loved_it).label("loved_it_count"),
            _bool_sum(BookReview.felt_aroused).label("felt_aroused_count"),
            _bool_sum(BookReview.found_heavy).label("found_heavy_count"),
            _bool_sum(BookReview.wants_more_from_author).label("wants_more_count"),
        ).where(BookReview.group_id == group_id)
    )
    emotional_row = emotional_result.one()
    emotional_stats = {
        "total_reviews": int(emotional_row.total_reviews or 0),
        "cried_count": int(emotional_row.cried_count or 0),
        "loved_it_count": int(emotional_row.loved_it_count or 0),
        "felt_aroused_count": int(emotional_row.felt_aroused_count or 0),
        "found_heavy_count": int(emotional_row.found_heavy_count or 0),
        "wants_more_count": int(emotional_row.wants_more_count or 0),
    }

    return {
        "total_books_read": total_books_read,
        "total_pages_read": total_pages_read,
        "average_rating": average_rating,
        "total_reading_time_minutes": total_reading_time,
        "books_per_genre": books_per_genre,
        "member_leaderboard": leaderboard,
        "rating_distribution": rating_distribution,
        "emotional_stats": emotional_stats,
    }


async def get_round_stats(
    db: AsyncSession,
    group_id: uuid.UUID,
    round_id: uuid.UUID,
) -> dict[str, Any]:
    """Return stats for a specific round."""
    round_result = await db.execute(
        select(Round).where(Round.id == round_id, Round.group_id == group_id)
    )
    round_ = round_result.scalar_one_or_none()
    if round_ is None:
        raise StatsError("Rodada não encontrada.", status_code=404)

    # Review stats
    review_stats_result = await db.execute(
        select(
            func.count(BookReview.id).label("reviews_count"),
            func.avg(BookReview.star_rating).label("avg_rating"),
        ).where(BookReview.round_id == round_id)
    )
    review_row = review_stats_result.one()
    reviews_count = int(review_row.reviews_count or 0)
    avg_rating = float(review_row.avg_rating) if review_row.avg_rating else None

    # Total reading time for this round
    time_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
            ReadingSession.round_id == round_id
        )
    )
    total_time = int(time_result.scalar_one())

    # Members total in group
    members_count_result = await db.execute(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == group_id)
    )
    members_total = int(members_count_result.scalar_one() or 0)

    return {
        "round_id": str(round_id),
        "book_title": round_.book_title,
        "book_author": round_.book_author,
        "total_pages": round_.book_page_count,
        "average_rating": avg_rating,
        "reviews_count": reviews_count,
        "total_reading_time_minutes": total_time,
        "members_finished": reviews_count,
        "members_total": members_total,
    }


async def get_user_stats(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """Return personal stats across all groups."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise StatsError("Usuário não encontrado.", status_code=404)

    # Total books (reviews submitted = books completed)
    total_books_result = await db.execute(
        select(func.count(BookReview.id)).where(BookReview.user_id == user_id)
    )
    total_books = int(total_books_result.scalar_one() or 0)

    # Total reading time
    total_time_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
            ReadingSession.user_id == user_id
        )
    )
    total_reading_time = int(total_time_result.scalar_one())

    # Genres read (from finished rounds)
    # Get rounds where user has reviews
    rounds_result = await db.execute(
        select(Round.book_genres).where(
            Round.id.in_(
                select(BookReview.round_id).where(BookReview.user_id == user_id)
            ),
            Round.book_genres.isnot(None),
        )
    )
    genres_read = _tally_genres([row[0] for row in rounds_result.all()])

    # Badges count
    badges_count_result = await db.execute(
        select(func.count(UserBadge.id)).where(UserBadge.user_id == user_id)
    )
    badges_count = int(badges_count_result.scalar_one() or 0)

    return {
        "total_books": total_books,
        "total_reading_time_minutes": total_reading_time,
        "genres_read": genres_read,
        "longest_streak": user.streak_longest,
        "badges_count": badges_count,
    }
