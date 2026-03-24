"""User session management — list, revoke, revoke-all-others."""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import REFRESH_TOKEN_BLACKLIST_TTL, TOKEN_BLACKLIST_PREFIX
from app.core.exceptions import ServiceError
from app.db.models.user_session import UserSession

logger = structlog.get_logger(__name__)


class SessionError(ServiceError):
    pass


async def blacklist_jti(redis: aioredis.Redis, jti: str) -> None:
    """Blacklist a refresh token JTI in Redis for the standard TTL."""
    await redis.set(f"{TOKEN_BLACKLIST_PREFIX}{jti}", "1", ex=REFRESH_TOKEN_BLACKLIST_TTL)


async def list_sessions(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_jti: str | None,
) -> list[dict]:
    """Return all active sessions for a user, marking the current one."""
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "device_info": s.device_info,
            "ip_address": s.ip_address,
            "last_active_at": s.last_active_at,
            "created_at": s.created_at,
            "is_current": s.refresh_token_jti == current_jti,
        }
        for s in sessions
    ]


async def revoke_session(
    db: AsyncSession,
    redis: aioredis.Redis,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
) -> None:
    """Revoke a specific session by ID and blacklist its JTI in Redis."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise SessionError("Sessão não encontrada.", status_code=404)
    session.revoked_at = datetime.now(UTC)
    await blacklist_jti(redis, session.refresh_token_jti)
    logger.info("session_revoked", user_id=str(user_id), session_id=str(session_id))


async def revoke_all_other_sessions(
    db: AsyncSession,
    redis: aioredis.Redis,
    user_id: uuid.UUID,
    current_jti: str,
) -> int:
    """Revoke all sessions except the current one. Returns count of revoked sessions."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
            UserSession.refresh_token_jti != current_jti,
        )
    )
    sessions = result.scalars().all()
    now = datetime.now(UTC)
    for s in sessions:
        s.revoked_at = now
    # Blacklist all JTIs in parallel
    if sessions:
        await asyncio.gather(
            *[blacklist_jti(redis, s.refresh_token_jti) for s in sessions]
        )
    count = len(sessions)
    logger.info("sessions_revoked_all_others", user_id=str(user_id), count=count)
    return count
