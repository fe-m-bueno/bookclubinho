"""Realtime events published to a group's Redis Streams.

Every event that reaches a client goes through here. Before this module the
stream key was built by string interpolation at 6 call sites, the payload was a
dict literal at each one, and the only written-down schema was a docstring in
`chat_stream.py` that had drifted — it listed events nobody emitted and omitted
two that were emitted.

**The key comes from the event type, not the caller.** That's the property worth
having: `review.submit_review` used to publish `review_submitted` to the
`:events` stream by passing `stream="events"`, and nothing could have caught it.

## What is not here

Seven event types were emitted to `bookclub:group:{id}:events` and no client ever
consumed them: `progress_updated`, `streak_updated`, `streak_milestone`,
`approaching_end`, `badge_earned`, `round_finalized`, `review_submitted`. The
frontend registers `EventSource` listeners for six types, all of them chat, so
the whole `:events` stream was write-only — computed, serialized, XADDed and
dropped by the browser. They were removed rather than declared. If any of them
comes back, it comes back with the UI that consumes it.

## Ordering

Publishing is scheduled through `AfterCommit`, so a client that receives
"message created" and refetches finds the row. The exception is `user_typing`,
which isn't tied to a transaction at all and publishes inline.
"""

from __future__ import annotations

import uuid  # noqa: TC003 — runtime use in signatures
from dataclasses import dataclass
from typing import Literal

import structlog
from redis.exceptions import RedisError

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

# Suffix of `bookclub:group:{group_id}:{stream}`, or the standalone notifications
# stream consumed by app/workers/notification.py.
Stream = Literal["chat", "notifications"]

# O stream de notificações não é por grupo: um worker só drena todos.
NOTIFICATIONS_KEY = "bookclub:notifications"

# The chat stream is read by browsers over SSE and trimmed short; the
# notifications stream is drained by a worker and can lag further behind.
_MAXLEN: dict[Stream, int] = {"chat": 10_000, "notifications": 50_000}


@dataclass(frozen=True, slots=True)
class GroupEvent:
    """An event and the stream it belongs to.

    Construct through the classmethods — they're the schema. Redis Streams only
    store strings, so every field is already a string by the time it gets here.
    """

    stream: Stream
    fields: dict[str, str]

    @property
    def type(self) -> str:
        return self.fields["type"]

    # ── Chat stream — consumed by use-chat-sse.ts ─────────────────────────────

    @classmethod
    def message_created(cls, message_id: uuid.UUID, user_id: uuid.UUID) -> GroupEvent:
        return cls("chat", {"type": "message_created", "message_id": str(message_id), "user_id": str(user_id)})

    @classmethod
    def message_edited(cls, message_id: uuid.UUID, user_id: uuid.UUID) -> GroupEvent:
        return cls("chat", {"type": "message_edited", "message_id": str(message_id), "user_id": str(user_id)})

    @classmethod
    def message_deleted(cls, message_id: uuid.UUID, user_id: uuid.UUID) -> GroupEvent:
        return cls("chat", {"type": "message_deleted", "message_id": str(message_id), "user_id": str(user_id)})

    @classmethod
    def reaction_added(cls, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str) -> GroupEvent:
        return cls(
            "chat",
            {
                "type": "reaction_added",
                "message_id": str(message_id),
                "user_id": str(user_id),
                "emoji": emoji,
            },
        )

    @classmethod
    def reaction_removed(cls, message_id: uuid.UUID, user_id: uuid.UUID, emoji: str) -> GroupEvent:
        return cls(
            "chat",
            {
                "type": "reaction_removed",
                "message_id": str(message_id),
                "user_id": str(user_id),
                "emoji": emoji,
            },
        )

    @classmethod
    def user_typing(cls, user_id: uuid.UUID, display_name: str, avatar_url: str) -> GroupEvent:
        return cls(
            "chat",
            {
                "type": "user_typing",
                "user_id": str(user_id),
                "display_name": display_name,
                "avatar_url": avatar_url,
            },
        )

    # ── Notifications stream — consumed by workers/notification.py ────────────

    @classmethod
    def new_message(cls, group_id: uuid.UUID, user_id: uuid.UUID, message_id: uuid.UUID) -> GroupEvent:
        return cls(
            "notifications",
            {
                "type": "new_message",
                "group_id": str(group_id),
                "user_id": str(user_id),
                "message_id": str(message_id),
            },
        )

    @classmethod
    def approaching_end(
        cls,
        group_id: uuid.UUID,
        round_id: uuid.UUID,
        user_id: uuid.UUID,
        percentage: float,
    ) -> GroupEvent:
        return cls(
            "notifications",
            {
                "type": "approaching_end",
                "group_id": str(group_id),
                "round_id": str(round_id),
                "user_id": str(user_id),
                "percentage": str(percentage),
            },
        )


def stream_key(group_id: uuid.UUID, stream: Stream) -> str:
    """A chave Redis de um evento. `chat_stream.py` lê por aqui também."""
    if stream == "notifications":
        return NOTIFICATIONS_KEY
    return f"bookclub:group:{group_id}:{stream}"


async def publish(group_id: uuid.UUID, event: GroupEvent) -> None:
    """Fire-and-forget publish. Never raises — a dropped event must not fail a request."""
    key = stream_key(group_id, event.stream)
    try:
        redis = get_redis()
        await redis.xadd(key, event.fields, maxlen=_MAXLEN[event.stream], approximate=True)
    except RedisError:
        logger.warning("group_event_publish_failed", key=key, event_type=event.type)
