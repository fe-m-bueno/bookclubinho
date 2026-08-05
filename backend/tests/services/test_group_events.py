"""Contrato do módulo de eventos de grupo.

A propriedade que vale testar é: **a chave vem do tipo do evento, não de quem
chama**. Antes, `emit_group_event(group_id, payload, stream=...)` deixava o
stream a cargo do call site — e `review.submit_review` publicava
`review_submitted` no stream `:events` passando `stream="events"`. Nada podia
ter pego isso.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from redis.exceptions import RedisError

from app.services.group_events import NOTIFICATIONS_KEY, GroupEvent, publish, stream_key

GROUP = uuid.uuid4()
USER = uuid.uuid4()
MSG = uuid.uuid4()
ROUND = uuid.uuid4()

CHAT_EVENTS = [
    GroupEvent.message_created(MSG, USER),
    GroupEvent.message_edited(MSG, USER),
    GroupEvent.message_deleted(MSG, USER),
    GroupEvent.reaction_added(MSG, USER, "👍"),
    GroupEvent.reaction_removed(MSG, USER, "👍"),
    GroupEvent.user_typing(USER, "Felipe", "http://avatar"),
]

NOTIFICATION_EVENTS = [
    GroupEvent.new_message(GROUP, USER, MSG),
    GroupEvent.approaching_end(GROUP, ROUND, USER, 85.0),
]


class TestStreamComesFromTheEvent:
    @pytest.mark.parametrize("event", CHAT_EVENTS, ids=lambda e: e.type)
    def test_chat_events_declare_the_chat_stream(self, event: GroupEvent) -> None:
        assert event.stream == "chat"

    @pytest.mark.parametrize("event", NOTIFICATION_EVENTS, ids=lambda e: e.type)
    def test_notification_events_declare_the_notifications_stream(self, event: GroupEvent) -> None:
        assert event.stream == "notifications"

    def test_chat_key_is_scoped_to_the_group(self) -> None:
        assert stream_key(GROUP, "chat") == f"bookclub:group:{GROUP}:chat"

    def test_notifications_key_ignores_the_group(self) -> None:
        """Um worker só drena todos os grupos."""
        assert stream_key(GROUP, "notifications") == NOTIFICATIONS_KEY
        assert stream_key(uuid.uuid4(), "notifications") == NOTIFICATIONS_KEY

    @pytest.mark.asyncio
    @pytest.mark.parametrize("event", CHAT_EVENTS, ids=lambda e: e.type)
    async def test_publish_routes_chat_events_to_the_chat_key(self, event: GroupEvent) -> None:
        redis = AsyncMock()
        with patch("app.services.group_events.get_redis", return_value=redis):
            await publish(GROUP, event)

        assert redis.xadd.await_args.args[0] == f"bookclub:group:{GROUP}:chat"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("event", NOTIFICATION_EVENTS, ids=lambda e: e.type)
    async def test_publish_routes_notifications_to_the_worker_key(self, event: GroupEvent) -> None:
        redis = AsyncMock()
        with patch("app.services.group_events.get_redis", return_value=redis):
            await publish(GROUP, event)

        assert redis.xadd.await_args.args[0] == NOTIFICATIONS_KEY


class TestPayload:
    @pytest.mark.parametrize("event", CHAT_EVENTS + NOTIFICATION_EVENTS, ids=lambda e: e.type)
    def test_every_field_is_a_string(self, event: GroupEvent) -> None:
        """Redis Streams só guarda string — a conversão era feita na mão em cada
        call site, o que é como `percentage` virava `str(85.0)` em um lugar e
        podia virar outra coisa noutro."""
        assert all(isinstance(v, str) for v in event.fields.values()), event.fields

    @pytest.mark.parametrize("event", CHAT_EVENTS + NOTIFICATION_EVENTS, ids=lambda e: e.type)
    def test_type_is_in_the_payload(self, event: GroupEvent) -> None:
        assert event.fields["type"] == event.type

    def test_chat_types_match_what_the_frontend_listens_for(self) -> None:
        """`use-chat-sse.ts` registra addEventListener para exatamente estes seis.

        Um evento de chat que não esteja aqui chega ao browser e é descartado —
        foi o que aconteceu com os sete tipos do stream `:events`.
        """
        assert {e.type for e in CHAT_EVENTS} == {
            "message_created",
            "message_edited",
            "message_deleted",
            "reaction_added",
            "reaction_removed",
            "user_typing",
        }

    def test_notification_types_match_what_the_worker_handles(self) -> None:
        assert {e.type for e in NOTIFICATION_EVENTS} == {"new_message", "approaching_end"}


class TestPublishIsFireAndForget:
    @pytest.mark.asyncio
    async def test_redis_failure_does_not_raise(self) -> None:
        redis = AsyncMock()
        redis.xadd = AsyncMock(side_effect=RedisError("Redis fora do ar"))
        with patch("app.services.group_events.get_redis", return_value=redis):
            await publish(GROUP, GroupEvent.message_created(MSG, USER))

    @pytest.mark.asyncio
    async def test_chat_stream_is_trimmed(self) -> None:
        redis = AsyncMock()
        with patch("app.services.group_events.get_redis", return_value=redis):
            await publish(GROUP, GroupEvent.message_created(MSG, USER))

        assert redis.xadd.await_args.kwargs["maxlen"] == 10_000
        assert redis.xadd.await_args.kwargs["approximate"] is True

    @pytest.mark.asyncio
    async def test_notifications_stream_is_trimmed_looser(self) -> None:
        """O worker drena mais devagar que um browser, então o buffer é maior."""
        redis = AsyncMock()
        with patch("app.services.group_events.get_redis", return_value=redis):
            await publish(GROUP, GroupEvent.new_message(GROUP, USER, MSG))

        assert redis.xadd.await_args.kwargs["maxlen"] == 50_000
