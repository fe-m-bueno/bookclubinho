"""Reading session service — timer sessions for tracking reading time."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select, update

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.reading_session import ReadingSession
from app.db.models.round import RoundStatus
from app.db.models.user import User
from app.services.round import verify_round_member

logger = structlog.get_logger(__name__)

# Sessions idle for more than 4 hours are auto-closed
_MAX_SESSION_HOURS = 4


class ReadingSessionError(ServiceError):
    """Raised when reading session validation fails."""


async def start_session(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ReadingSession:
    """Start a new reading session. Round must be in READING status.

    Raises ReadingSessionError if there is already an active session for this user.
    """
    round_ = await verify_round_member(db, round_id, user_id)

    if round_.status != RoundStatus.READING:
        raise ReadingSessionError(
            "A rodada não está em fase de leitura.",
            status_code=409,
        )

    # Check for existing active session (ended_at IS NULL)
    active_result = await db.execute(
        select(ReadingSession).where(
            ReadingSession.user_id == user_id,
            ReadingSession.ended_at.is_(None),
        )
    )
    active = active_result.scalar_one_or_none()
    if active is not None:
        if active.round_id == round_id:
            # Same round — idempotent: return the existing session (handles crash recovery)
            return active
        raise ReadingSessionError(
            "Já existe uma sessão de leitura ativa. Encerre-a primeiro.",
            status_code=409,
        )

    session = ReadingSession(
        user_id=user_id,
        round_id=round_id,
        started_at=datetime.now(UTC),
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)

    logger.info(
        "reading_session_started",
        session_id=str(session.id),
        round_id=str(round_id),
        user_id=str(user_id),
    )
    return session


async def stop_session(
    db: AsyncSession,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    duration_override_minutes: int | None = None,
) -> ReadingSession:
    """Stop an active reading session and record the duration.

    Updates user.total_reading_time_minutes accordingly.
    """
    result = await db.execute(
        select(ReadingSession).where(ReadingSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if session is None:
        raise ReadingSessionError("Sessão não encontrada.", status_code=404)
    if session.user_id != user_id:
        raise ReadingSessionError("Sessão não encontrada.", status_code=404)
    if session.ended_at is not None:
        raise ReadingSessionError("Sessão já encerrada.", status_code=409)

    now = datetime.now(UTC)
    session.ended_at = now

    if duration_override_minutes is not None:
        duration = duration_override_minutes
    else:
        started = session.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        elapsed = now - started.astimezone(UTC)
        duration = max(0, int(elapsed.total_seconds() // 60))

    session.duration_minutes = duration

    # Update user's total reading time (lock user row)
    user_result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = user_result.scalar_one_or_none()
    if user is not None:
        user.total_reading_time_minutes += duration

    await db.flush()
    await db.refresh(session)

    logger.info(
        "reading_session_stopped",
        session_id=str(session_id),
        user_id=str(user_id),
        duration_minutes=duration,
    )
    return session


async def list_my_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    round_id: uuid.UUID | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[ReadingSession], int, str | None]:
    """List sessions for a user, optionally filtered by round.

    Returns (sessions, total_duration_minutes, next_cursor).
    Auto-closes sessions that have been active for more than 4 hours.
    """
    await _auto_close_abandoned_sessions(db, user_id)

    # Base filters shared by both the paginated query and the duration aggregate
    base_filters = [ReadingSession.user_id == user_id]
    if round_id is not None:
        base_filters.append(ReadingSession.round_id == round_id)

    # Paginated session list (cursor applied only to the list query)
    list_filters = list(base_filters)
    if cursor is not None:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            list_filters.append(ReadingSession.created_at < cursor_dt)
        except ValueError:
            pass  # invalid cursor — ignore and return from start

    stmt = (
        select(ReadingSession)
        .where(*list_filters)
        .order_by(ReadingSession.created_at.desc())
        .limit(limit + 1)
    )
    result = await db.execute(stmt)
    sessions = list(result.scalars().all())

    next_cursor: str | None = None
    if len(sessions) > limit:
        sessions = sessions[:limit]
        next_cursor = sessions[-1].created_at.isoformat()

    # Aggregate total duration (no cursor — counts all sessions, not just the current page)
    agg_result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
            *base_filters
        )
    )
    total_duration = int(agg_result.scalar() or 0)

    return sessions, total_duration, next_cursor


async def _auto_close_abandoned_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    """Close any sessions that have been active for more than _MAX_SESSION_HOURS hours."""
    cutoff = datetime.now(UTC) - timedelta(hours=_MAX_SESSION_HOURS)
    await db.execute(
        update(ReadingSession)
        .where(
            ReadingSession.user_id == user_id,
            ReadingSession.ended_at.is_(None),
            ReadingSession.started_at < cutoff,
        )
        .values(
            ended_at=func.now(),
            duration_minutes=_MAX_SESSION_HOURS * 60,
        )
    )
    await db.flush()
