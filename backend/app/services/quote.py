"""Hall of Quotes service — CRUD and voting."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import func, select

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.hall_of_quote import HallOfQuote, QuoteVote
from app.db.models.round import Round, RoundStatus
from app.db.models.user import User
from app.security.sanitizer import sanitize

logger = structlog.get_logger(__name__)


class QuoteError(ServiceError):
    """Raised when quote operations fail."""


async def create_quote(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    quote_text: str,
    page_reference: str | None,
    round_id: uuid.UUID | None,
) -> HallOfQuote:
    """Create a new hall of quote entry."""
    # Resolve round (provided or current active round)
    if round_id is not None:
        round_result = await db.execute(select(Round).where(Round.id == round_id, Round.group_id == group_id))
        round_ = round_result.scalar_one_or_none()
        if round_ is None:
            raise QuoteError("Rodada não encontrada neste grupo.", status_code=404)
    else:
        # Find current active round
        round_result = await db.execute(
            select(Round)
            .where(
                Round.group_id == group_id,
                Round.status.in_([RoundStatus.READING, RoundStatus.REVIEWING]),
            )
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        round_ = round_result.scalar_one_or_none()

    book_title = round_.book_title if round_ else "Leitura do grupo"
    book_author = round_.book_author if round_ else None

    quote = HallOfQuote(
        group_id=group_id,
        round_id=round_.id if round_ else None,
        user_id=user_id,
        quote_text=sanitize(quote_text),
        page_reference=sanitize(page_reference) if page_reference else None,
        book_title=book_title,
        book_author=book_author,
    )
    db.add(quote)
    await db.flush()
    await db.refresh(quote)

    logger.info("quote_created", quote_id=str(quote.id), group_id=str(group_id))
    return quote


async def list_quotes(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    sort: str = "votes",
    round_id: uuid.UUID | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], str | None]:
    """List quotes with pagination.

    sort=votes: cursor is "{vote_count}:{created_at_iso}" for stable ordering
    sort=recent: cursor is created_at ISO timestamp
    """
    # Subquery: vote count per quote
    vote_count_subq = (
        select(
            QuoteVote.quote_id,
            func.count(QuoteVote.id).label("vote_count"),
        )
        .group_by(QuoteVote.quote_id)
        .subquery("vote_counts")
    )

    # Check if user voted for each quote
    my_votes_subq = select(QuoteVote.quote_id).where(QuoteVote.user_id == user_id).subquery("my_votes")

    stmt = (
        select(
            HallOfQuote,
            User.username,
            User.display_name,
            User.avatar_url,
            func.coalesce(vote_count_subq.c.vote_count, 0).label("vote_count"),
            (my_votes_subq.c.quote_id.isnot(None)).label("did_i_vote"),
        )
        .join(User, User.id == HallOfQuote.user_id)
        .outerjoin(vote_count_subq, vote_count_subq.c.quote_id == HallOfQuote.id)
        .outerjoin(my_votes_subq, my_votes_subq.c.quote_id == HallOfQuote.id)
        .where(HallOfQuote.group_id == group_id)
    )

    if round_id is not None:
        stmt = stmt.where(HallOfQuote.round_id == round_id)

    # Apply cursor and ordering
    if sort == "votes":
        if cursor:
            parts = cursor.split(":", 1)
            if len(parts) == 2:
                try:
                    cursor_votes = int(parts[0])
                    cursor_dt = datetime.fromisoformat(parts[1])
                    stmt = stmt.where(
                        (func.coalesce(vote_count_subq.c.vote_count, 0) < cursor_votes)
                        | (
                            (func.coalesce(vote_count_subq.c.vote_count, 0) == cursor_votes)
                            & (HallOfQuote.created_at < cursor_dt)
                        )
                    )
                except (ValueError, IndexError):
                    pass
        stmt = stmt.order_by(
            func.coalesce(vote_count_subq.c.vote_count, 0).desc(),
            HallOfQuote.created_at.desc(),
        )
    else:  # recent
        if cursor:
            try:
                cursor_dt = datetime.fromisoformat(cursor)
                stmt = stmt.where(HallOfQuote.created_at < cursor_dt)
            except ValueError:
                pass
        stmt = stmt.order_by(HallOfQuote.created_at.desc())

    stmt = stmt.limit(limit + 1)
    result = await db.execute(stmt)
    rows = result.all()

    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        if sort == "votes":
            next_cursor = f"{last.vote_count}:{last.HallOfQuote.created_at.isoformat()}"
        else:
            next_cursor = last.HallOfQuote.created_at.isoformat()

    quotes = [
        {
            "id": str(row.HallOfQuote.id),
            "user_id": str(row.HallOfQuote.user_id),
            "username": row.username,
            "display_name": row.display_name,
            "avatar_url": row.avatar_url,
            "quote_text": row.HallOfQuote.quote_text,
            "page_reference": row.HallOfQuote.page_reference,
            "book_title": row.HallOfQuote.book_title,
            "book_author": row.HallOfQuote.book_author,
            "round_id": str(row.HallOfQuote.round_id) if row.HallOfQuote.round_id else None,
            "vote_count": int(row.vote_count),
            "did_i_vote": bool(row.did_i_vote),
            "created_at": row.HallOfQuote.created_at,
        }
        for row in rows
    ]
    return quotes, next_cursor


async def toggle_vote(
    db: AsyncSession,
    quote_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Toggle vote on a quote. Returns True if vote was added, False if removed."""
    # Verify quote exists and user can access it
    quote_result = await db.execute(select(HallOfQuote).where(HallOfQuote.id == quote_id))
    quote = quote_result.scalar_one_or_none()
    if quote is None:
        raise QuoteError("Quote não encontrada.", status_code=404)

    # Check existing vote
    existing_result = await db.execute(
        select(QuoteVote).where(
            QuoteVote.quote_id == quote_id,
            QuoteVote.user_id == user_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        return False
    else:
        vote = QuoteVote(quote_id=quote_id, user_id=user_id)
        db.add(vote)
        return True


async def delete_quote(
    db: AsyncSession,
    quote_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Delete a quote. Only the author can delete."""
    quote_result = await db.execute(select(HallOfQuote).where(HallOfQuote.id == quote_id))
    quote = quote_result.scalar_one_or_none()
    if quote is None:
        raise QuoteError("Quote não encontrada.", status_code=404)
    if quote.user_id != user_id:
        raise QuoteError("Apenas o autor pode remover esta quote.", status_code=403)

    await db.delete(quote)
    logger.info("quote_deleted", quote_id=str(quote_id))
