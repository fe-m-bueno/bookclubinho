"""
SSE streaming endpoint para o chat do grupo.

router — montado em /groups/{group_id}/chat/stream
  GET ""  — abre stream SSE, entrega eventos de chat e progresso em tempo real
"""

from __future__ import annotations

import json
import uuid  # noqa: TC003
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

import structlog
from fastapi import APIRouter, Request
from redis.exceptions import RedisError
from sse_starlette.sse import EventSourceResponse

from app.core.deps import CurrentUser, GroupMemberDep  # noqa: TC001
from app.core.redis import get_redis
from app.security.rate_limit import limiter

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["chat-stream"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
_BLOCK_MS = 15_000  # ms to block on XREAD before sending a ping
_BATCH_COUNT = 50


@router.get(
    "",
    summary="Stream SSE do chat do grupo",
)
@limiter.limit("30/minute")
async def group_chat_stream(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
) -> EventSourceResponse:
    """Abre um stream SSE que entrega eventos de chat e progresso em tempo real.

    Streams consumidos:
    - ``bookclub:group:{group_id}:chat``   — message_created/edited/deleted,
                                             reaction_added/removed
    - ``bookclub:group:{group_id}:events`` — progress_updated, streak_updated,
                                             approaching_end, streak_milestone,
                                             round_finalized

    Reconexão automática: o browser envia ``Last-Event-ID`` e o stream retoma
    a partir desse ponto nos dois streams.
    """

    async def _event_generator() -> AsyncGenerator[dict[str, Any], None]:
        redis = get_redis()
        chat_key = f"bookclub:group:{group_id}:chat"
        events_key = f"bookclub:group:{group_id}:events"

        # Resume from Last-Event-ID if provided; otherwise only new events
        last_event_id: str = request.headers.get("Last-Event-ID", "$")
        chat_last_id = last_event_id
        events_last_id = last_event_id

        while True:
            if await request.is_disconnected():
                break

            try:
                results = await redis.xread(
                    {chat_key: chat_last_id, events_key: events_last_id},
                    count=_BATCH_COUNT,
                    block=_BLOCK_MS,
                )
            except RedisError as exc:
                logger.warning(
                    "sse_redis_error",
                    group_id=str(group_id),
                    user_id=str(current_user.id),
                    error=str(exc),
                )
                yield {"event": "error", "data": json.dumps({"detail": "Erro de conexão."})}
                break

            if not results:
                # Timeout — send keepalive ping
                yield {"comment": "ping"}
                continue

            for stream_name, messages in results:
                for msg_id, fields in messages:
                    event_type = fields.get("type", "event")
                    # Remove "type" from payload data (it's the event name)
                    payload = {k: v for k, v in fields.items() if k != "type"}
                    yield {
                        "event": event_type,
                        "data": json.dumps(payload),
                        "id": msg_id,
                    }
                    # Update last-seen ID per stream
                    if stream_name == chat_key:
                        chat_last_id = msg_id
                    else:
                        events_last_id = msg_id

    return EventSourceResponse(_event_generator(), headers=_SSE_HEADERS)
