"""Shared helpers for group-scoped services."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import structlog
from redis.exceptions import RedisError
from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.group import GroupMember

logger = structlog.get_logger(__name__)


async def check_membership(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> GroupMember:
    """Return GroupMember or raise ServiceError 404."""
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise ServiceError("Clube não encontrado.", status_code=404)
    return member


async def validate_round_in_group(db: AsyncSession, round_id_str: str, group_id: uuid.UUID) -> uuid.UUID:
    """Validate that round belongs to group. Returns parsed round UUID."""
    from app.db.models.round import Round

    round_uuid = uuid.UUID(round_id_str)
    result = await db.execute(select(Round).where(Round.id == round_uuid))
    round_ = result.scalar_one_or_none()
    if round_ is None or round_.group_id != group_id:
        raise ServiceError("Rodada não encontrada neste grupo.", status_code=404)
    return round_uuid


async def emit_group_event(
    group_id: uuid.UUID,
    event_data: dict[str, str],
    *,
    stream: str = "chat",
) -> None:
    """Fire-and-forget Redis stream event for a group channel.

    Args:
        stream: Stream suffix — ``"chat"`` (default) or ``"events"``.
    """
    try:
        redis = get_redis()
        stream_key = f"bookclub:group:{group_id}:{stream}"
        await redis.xadd(stream_key, event_data, maxlen=10000, approximate=True)
    except RedisError:
        logger.warning("group_event_emit_failed", group_id=str(group_id))
