"""Shelf service — group bookshelf and public cache."""

from __future__ import annotations

import uuid  # noqa: TC003 — used at runtime for isinstance check in _make_serializable
from typing import TYPE_CHECKING, Any

import orjson
import structlog
from redis.exceptions import RedisError
from sqlalchemy import func, select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.book_review import BookReview
from app.db.models.group import Group
from app.db.models.round import Round, RoundStatus

logger = structlog.get_logger(__name__)

_SHELF_CACHE_TTL = 86400  # 24 horas


class ShelfError(ServiceError):
    """Raised when shelf operations fail."""


async def get_group_shelf(
    db: AsyncSession,
    group_id: uuid.UUID,
) -> dict[str, Any]:
    """Return the group's bookshelf (finished rounds). Also refreshes public cache."""
    group_result = await db.execute(select(Group).where(Group.id == group_id))
    group = group_result.scalar_one_or_none()
    if group is None:
        raise ShelfError("Grupo não encontrado.", status_code=404)

    shelf_data = await _build_shelf_data(db, group)

    # Refresh public cache opportunistically
    await _write_shelf_cache(group_id, shelf_data)

    return shelf_data


async def get_public_shelf(group_id: uuid.UUID) -> dict[str, Any] | None:
    """Read shelf from Redis cache (no DB access — avoids RLS for anonymous users)."""
    try:
        redis = get_redis()
        cached = await redis.get(f"shelf:public:{group_id}")
        if cached:
            return orjson.loads(cached)
    except RedisError:
        logger.warning("shelf_cache_read_failed", group_id=str(group_id))
    return None


async def populate_shelf_cache(
    group_id: uuid.UUID,
) -> None:
    """Build and cache the public shelf. Called after round finish.

    Opens its own DB session so it can safely run as a FastAPI BackgroundTask
    (the request session is already closed by the time background tasks execute).
    """
    from app.db.engine import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            group_result = await db.execute(select(Group).where(Group.id == group_id))
            group = group_result.scalar_one_or_none()
            if group is None:
                return

            shelf_data = await _build_shelf_data(db, group)
            await _write_shelf_cache(group_id, shelf_data)
    except Exception:
        logger.exception("shelf_cache_populate_failed", group_id=str(group_id))


async def _write_shelf_cache(group_id: uuid.UUID, data: dict[str, Any]) -> None:
    """Serialize and store shelf data in Redis."""
    try:
        redis = get_redis()

        # Convert datetime objects to ISO strings for JSON serialization
        serializable = _make_serializable(data)
        await redis.set(
            f"shelf:public:{group_id}",
            orjson.dumps(serializable),
            ex=_SHELF_CACHE_TTL,
        )
    except RedisError:
        logger.warning("shelf_cache_write_failed", group_id=str(group_id))


def _make_serializable(obj: Any) -> Any:
    """Recursively convert datetime/UUID objects for JSON serialization."""
    from datetime import datetime

    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_make_serializable(i) for i in obj]
    return obj


async def _build_shelf_data(
    db: AsyncSession,
    group: Group,
) -> dict[str, Any]:
    """Build the full shelf data for a group."""
    rounds_result = await db.execute(
        select(Round)
        .where(
            Round.group_id == group.id,
            Round.status == RoundStatus.FINISHED,
        )
        .order_by(Round.finished_at.desc())
    )
    finished_rounds = rounds_result.scalars().all()

    books = []
    for round_ in finished_rounds:
        # Review stats for this round
        review_stats_result = await db.execute(
            select(
                func.count(BookReview.id).label("review_count"),
                func.avg(BookReview.star_rating).label("avg_rating"),
            ).where(BookReview.round_id == round_.id)
        )
        review_row = review_stats_result.one()
        review_count = int(review_row.review_count or 0)
        avg_rating = float(review_row.avg_rating) if review_row.avg_rating else None

        # Top funny one-liners (up to 3, random selection)
        oneliners_result = await db.execute(
            select(BookReview.funny_oneliner)
            .where(
                BookReview.round_id == round_.id,
                BookReview.funny_oneliner.isnot(None),
                BookReview.funny_oneliner != "",
            )
            .order_by(func.random())
            .limit(3)
        )
        oneliners = [row[0] for row in oneliners_result.all() if row[0]]

        books.append(
            {
                "book_title": round_.book_title or "",
                "book_author": round_.book_author,
                "book_cover_url": round_.book_cover_url,
                "page_count": round_.book_page_count,
                "genres": round_.book_genres or [],
                "average_rating": avg_rating,
                "review_count": review_count,
                "started_at": round_.started_at,
                "finished_at": round_.finished_at,
                "top_oneliners": oneliners,
            }
        )

    return {
        "group_name": group.name,
        "group_photo_url": group.photo_url,
        "books": books,
    }
