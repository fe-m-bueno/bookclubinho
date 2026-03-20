"""Book review business logic — submit, list, update, stats."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import case, func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.review import ReviewCreateRequest, ReviewUpdateRequest

from app.core.exceptions import ServiceError
from app.db.models.book_review import BookReview
from app.db.models.reading_progress import ReadingProgress
from app.db.models.round import RoundStatus
from app.security.sanitizer import sanitize
from app.services.group_helpers import emit_group_event
from app.services.round import verify_round_member

logger = structlog.get_logger(__name__)

_EDIT_WINDOW = timedelta(hours=48)


class ReviewError(ServiceError):
    """Raised when review validation fails."""


async def submit_review(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ReviewCreateRequest,
) -> BookReview:
    """Submit a book review. Round must be in READING or REVIEWING status."""
    round_ = await verify_round_member(db, round_id, user_id)

    if round_.status not in (RoundStatus.READING, RoundStatus.REVIEWING):
        raise ReviewError(
            "Reviews só podem ser enviadas durante a leitura ou fase de reviews.",
            status_code=409,
        )

    # Check for duplicate
    existing = await db.execute(
        select(BookReview.id).where(
            BookReview.round_id == round_id,
            BookReview.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ReviewError("Você já enviou uma review para esta rodada.", status_code=409)

    review = BookReview(
        round_id=round_id,
        user_id=user_id,
        group_id=round_.group_id,
        star_rating=data.star_rating,
        cried=data.cried,
        loved_it=data.loved_it,
        felt_aroused=data.felt_aroused,
        found_heavy=data.found_heavy,
        wants_more_from_author=data.wants_more_from_author,
        sincere_review=sanitize(data.sincere_review),
        funny_oneliner=sanitize(data.funny_oneliner) if data.funny_oneliner else None,
        extra_thoughts=sanitize(data.extra_thoughts) if data.extra_thoughts else None,
    )
    db.add(review)

    # Auto-mark reading progress as finished if not already
    latest_progress = await db.execute(
        select(ReadingProgress)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
            ReadingProgress.progress_type == "finished",
        )
        .limit(1)
    )
    if latest_progress.scalar_one_or_none() is None:
        finished_progress = ReadingProgress(
            round_id=round_id,
            user_id=user_id,
            current_page=round_.book_page_count,
            percentage=100.0,
            progress_type="finished",
            total_pages=round_.book_page_count,
        )
        db.add(finished_progress)

    await db.flush()

    # Reload with user relationship for response serialization
    result = await db.execute(
        select(BookReview)
        .where(BookReview.id == review.id)
        .options(selectinload(BookReview.user))
    )
    review = result.scalar_one()

    logger.info("review_submitted", round_id=str(round_id), user_id=str(user_id))

    # Emit Redis event (fire-and-forget)
    await emit_group_event(
        round_.group_id,
        {
            "type": "review_submitted",
            "round_id": str(round_id),
            "user_id": str(user_id),
        },
        stream="events",
    )

    return review


async def get_all_reviews(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[BookReview]:
    """Return all reviews for a round. Requires user to have submitted own review."""
    await verify_round_member(db, round_id, user_id)
    await _require_own_review(db, round_id, user_id)

    result = await db.execute(
        select(BookReview)
        .where(BookReview.round_id == round_id)
        .options(selectinload(BookReview.user))
        .order_by(BookReview.completed_at)
    )
    return list(result.scalars().all())


async def get_my_review(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> BookReview | None:
    """Return the user's own review for a round, or None."""
    await verify_round_member(db, round_id, user_id)

    result = await db.execute(
        select(BookReview)
        .where(BookReview.round_id == round_id, BookReview.user_id == user_id)
        .options(selectinload(BookReview.user))
    )
    return result.scalar_one_or_none()


async def update_review(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ReviewUpdateRequest,
) -> BookReview:
    """Edit own review within 48 hours of submission."""
    await verify_round_member(db, round_id, user_id)

    result = await db.execute(
        select(BookReview)
        .where(BookReview.round_id == round_id, BookReview.user_id == user_id)
        .options(selectinload(BookReview.user))
    )
    review = result.scalar_one_or_none()
    if review is None:
        raise ReviewError("Review não encontrada.", status_code=404)

    if datetime.now(UTC) - review.completed_at > _EDIT_WINDOW:
        raise ReviewError(
            "O prazo de 48h para editar a review expirou.",
            status_code=409,
        )

    # Apply non-None fields (sincere_review is NOT NULL in DB)
    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if field == "sincere_review" and value is None:
            continue  # Cannot null a NOT NULL column
        if field in ("sincere_review", "funny_oneliner", "extra_thoughts") and value is not None:
            value = sanitize(value)
        setattr(review, field, value)

    await db.flush()
    await db.refresh(review)

    logger.info("review_updated", round_id=str(round_id), user_id=str(user_id))
    return review


async def get_review_stats(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Return aggregated review stats. Requires user to have submitted own review."""
    await verify_round_member(db, round_id, user_id)
    await _require_own_review(db, round_id, user_id)

    result = await db.execute(
        select(
            func.count().label("total_reviews"),
            func.avg(BookReview.star_rating).label("avg_star_rating"),
            func.sum(case((BookReview.cried.is_(True), 1), else_=0)).label(
                "cried_count"
            ),
            func.sum(case((BookReview.loved_it.is_(True), 1), else_=0)).label(
                "loved_it_count"
            ),
            func.sum(case((BookReview.felt_aroused.is_(True), 1), else_=0)).label(
                "felt_aroused_count"
            ),
            func.sum(case((BookReview.found_heavy.is_(True), 1), else_=0)).label(
                "found_heavy_count"
            ),
            func.sum(
                case((BookReview.wants_more_from_author.is_(True), 1), else_=0)
            ).label("wants_more_count"),
        ).where(BookReview.round_id == round_id)
    )
    row = result.one()
    return {
        "total_reviews": row.total_reviews,
        "avg_star_rating": round(float(row.avg_star_rating or 0), 2),
        "cried_count": row.cried_count,
        "loved_it_count": row.loved_it_count,
        "felt_aroused_count": row.felt_aroused_count,
        "found_heavy_count": row.found_heavy_count,
        "wants_more_count": row.wants_more_count,
    }


# ── Private helpers ──────────────────────────────────────────────────────────


async def _require_own_review(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Raise 403 if user hasn't submitted their own review."""
    result = await db.execute(
        select(BookReview.id).where(
            BookReview.round_id == round_id,
            BookReview.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ReviewError("Envie sua review primeiro!", status_code=403)


