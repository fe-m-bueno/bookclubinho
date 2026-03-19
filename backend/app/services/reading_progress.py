"""Reading progress service — append-only snapshots per user per round."""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from fastapi import HTTPException
from sqlalchemy import func, select

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import GroupMember
from app.db.models.reading_progress import ReadingProgress
from app.db.models.round import RoundStatus
from app.services.round import verify_round_member

logger = structlog.get_logger(__name__)


async def log_progress(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    current_page: int | None,
    percentage: float | None,
) -> ReadingProgress:
    """Insert a new progress snapshot. Round must be in READING status."""
    round_ = await verify_round_member(db, round_id, user_id)

    if round_.status != RoundStatus.READING:
        raise HTTPException(
            status_code=409,
            detail="A rodada não está em fase de leitura.",
        )

    # Derive percentage from page when page_count is known
    computed_pct: float
    if current_page is not None and round_.book_page_count:
        computed_pct = min(100.0, (current_page / round_.book_page_count) * 100.0)
    elif percentage is not None:
        computed_pct = percentage
    else:
        # current_page given but no page_count to compute from — keep at 0
        computed_pct = 0.0

    progress = ReadingProgress(
        round_id=round_id,
        user_id=user_id,
        current_page=current_page,
        percentage=computed_pct,
    )
    db.add(progress)
    await db.flush()
    await db.refresh(progress)

    logger.info(
        "progress_logged",
        round_id=str(round_id),
        user_id=str(user_id),
        pct=computed_pct,
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
