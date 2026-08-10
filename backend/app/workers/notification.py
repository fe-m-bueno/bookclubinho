"""
Notification worker — consumes events from Redis Streams and dispatches emails.

Run standalone:
    python -m app.workers.notification
"""

from __future__ import annotations

import asyncio
import contextlib
import signal
import time
import uuid
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

import redis.asyncio as aioredis
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.engine import AsyncSessionLocal
from app.services import group_events

if TYPE_CHECKING:
    from app.db.models.user import User

logger = structlog.get_logger(__name__)

# A chave é declarada em app.services.group_events, junto dos eventos
# que este worker consome.
STREAM_KEY = group_events.NOTIFICATIONS_KEY
CONSUMER_GROUP = "notification-workers"
CONSUMER_NAME = "worker-1"
HEARTBEAT_KEY = "worker:notifications:heartbeat"
# Modo --once: o TTL cobre folgadamente o intervalo do cron (10 min), porque o
# atraso do agendador do GitHub é comum. Ver `run_once`.
ONCE_HEARTBEAT_TTL = 25 * 60
# Teto de lotes por corrida: 10 eventos cada, então 200 eventos. Impede que uma
# enxurrada segure o job indefinidamente — o resto fica no stream para a próxima.
ONCE_MAX_BATCHES = 20
MEETING_REMINDERS_KEY = "meeting_reminders"
HEARTBEAT_INTERVAL = 30  # seconds
REMINDER_POLL_INTERVAL = 60  # seconds
DIGEST_COOLDOWN_TTL = 900  # 15 minutes in seconds
REMINDER_BATCH_SIZE = 50  # max reminders processed per poll cycle


async def _group_recipients(
    db: AsyncSession,
    group_id: uuid.UUID,
    exclude_user_id: uuid.UUID,
) -> list[User]:
    """Quem recebe notificação deste grupo: membros ativos, menos o autor do evento."""
    from app.db.models.group import GroupMember
    from app.db.models.user import User

    result = await db.execute(
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(
            GroupMember.group_id == group_id,
            User.id != exclude_user_id,
            User.is_active.is_(True),
        )
    )
    return list(result.scalars().all())


async def _send_to_each(
    recipients: Sequence[User],
    send: Callable[[User], Awaitable[None]],
    *,
    event: str,
    **log_fields: str,
) -> None:
    """Dispara `send` para todos os destinatários em paralelo, isolando falhas.

    As corrotinas só fazem I/O de rede (Resend, Redis) — nenhuma toca a
    AsyncSession, que não é segura para uso concorrente.
    """
    results = await asyncio.gather(*(send(r) for r in recipients), return_exceptions=True)
    for recipient, outcome in zip(recipients, results, strict=True):
        if isinstance(outcome, BaseException):
            logger.error(event, user_id=str(recipient.id), exc_info=outcome, **log_fields)


async def process_event(
    redis: aioredis.Redis,
    event_id: str,
    data: dict[str, str],
) -> None:
    """Dispatch a notification event to the appropriate handler."""
    event_type = data.get("type", "unknown")
    logger.info("processing_notification", event_id=event_id, type=event_type)

    if event_type == "approaching_end":
        await _handle_approaching_end(data)
    elif event_type == "new_message":
        await _handle_new_message(redis, data)
    else:
        logger.debug("unhandled_notification_type", type=event_type)


async def _handle_approaching_end(data: dict[str, str]) -> None:
    """Send approaching_end emails to group members."""
    from app.db.models.group import Group
    from app.db.models.user import User
    from app.services.email import email_service

    round_id_str = data.get("round_id")
    group_id_str = data.get("group_id")
    user_id_str = data.get("user_id")
    percentage_str = data.get("percentage", "0")

    if not all([round_id_str, group_id_str, user_id_str]):
        logger.warning("approaching_end_missing_data", data=data)
        return

    try:
        group_id = uuid.UUID(group_id_str)  # type: ignore[arg-type]
        reader_user_id = uuid.UUID(user_id_str)  # type: ignore[arg-type]
        percentage = float(percentage_str)
    except (ValueError, TypeError):
        logger.warning("approaching_end_invalid_data", data=data)
        return

    async with AsyncSessionLocal() as db:
        reader_result = await db.execute(select(User).where(User.id == reader_user_id))
        reader = reader_result.scalar_one_or_none()
        if reader is None:
            return

        reader_name = reader.display_name or reader.username or "um membro"

        group_result = await db.execute(select(Group).where(Group.id == group_id))
        group = group_result.scalar_one_or_none()
        if group is None:
            return

        group_url = f"{settings.APP_URL}/groups/{group_id}"

        members = await _group_recipients(db, group_id, reader_user_id)

        async def _send(member: User) -> None:
            await email_service.send_approaching_end(
                user=member,
                group_name=group.name,
                reader_name=reader_name,
                progress_percent=percentage,
                group_url=group_url,
            )

        await _send_to_each(members, _send, event="approaching_end_email_failed")


async def _handle_new_message(redis: aioredis.Redis, data: dict[str, str]) -> None:
    """Buffer new message notifications and send digest after cooldown."""
    from app.db.models.group import Group
    from app.db.models.message import GroupMessage
    from app.services.email import email_service

    group_id_str = data.get("group_id")
    user_id_str = data.get("user_id")
    message_id_str = data.get("message_id")

    if not all([group_id_str, user_id_str, message_id_str]):
        return

    try:
        group_id = uuid.UUID(group_id_str)  # type: ignore[arg-type]
        sender_id = uuid.UUID(user_id_str)  # type: ignore[arg-type]
        message_id = uuid.UUID(message_id_str)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return

    async with AsyncSessionLocal() as db:
        # Fetch message and group once — they're the same for all members
        msg_result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
        msg = msg_result.scalar_one_or_none()
        if msg is None:
            return

        group_result = await db.execute(select(Group).where(Group.id == group_id))
        group = group_result.scalar_one_or_none()
        if group is None:
            return

        members = await _group_recipients(db, group_id, sender_id)

        # Filter members who want updates and check cooldown via mget
        eligible = [m for m in members if m.email_notifications.get("all_updates", False)]
        if not eligible:
            return

        cooldown_keys = [f"digest_cooldown:{m.id}:{group_id}" for m in eligible]
        cooldown_vals = await redis.mget(*cooldown_keys)

        preview = msg.content_text or "[mídia]"
        if len(preview) > 80:
            preview = preview[:80] + "..."
        group_url = f"{settings.APP_URL}/groups/{group_id}/chat"

        recipients = [
            member for member, cooldown_val in zip(eligible, cooldown_vals, strict=False) if cooldown_val is None
        ]

        async def _send(member: User) -> None:
            await email_service.send_post_digest(
                user=member,
                group_name=group.name,
                messages_preview=[preview],
                group_url=group_url,
            )
            # Só marca o cooldown depois do envio bem-sucedido — uma falha
            # parcial não pode silenciar quem não recebeu nada.
            await redis.setex(f"digest_cooldown:{member.id}:{group_id}", DIGEST_COOLDOWN_TTL, "1")

        await _send_to_each(recipients, _send, event="digest_email_failed")


async def _ensure_consumer_group(redis: aioredis.Redis) -> None:
    with contextlib.suppress(Exception):
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)


async def _read_and_process_batch(redis: aioredis.Redis, *, block_ms: int | None) -> int:
    """Lê um lote do stream, processa e confirma. Devolve quantos processou.

    Um lote só, sem laço: quem repete é o chamador — o daemon para sempre, o
    modo `--once` até esvaziar.

    `block_ms=None` é leitura sem bloqueio; devolve na hora se o stream estiver
    vazio. **Não use `0`**: em Redis, `BLOCK 0` quer dizer bloquear para sempre,
    e não "não bloqueie" — o modo `--once` travava até o timeout do socket.
    """
    results = await redis.xreadgroup(
        groupname=CONSUMER_GROUP,
        consumername=CONSUMER_NAME,
        streams={STREAM_KEY: ">"},
        count=10,
        block=block_ms,
    )

    lidos = 0
    for _stream, messages in results or []:
        for msg_id, data in messages:
            lidos += 1
            try:
                await process_event(redis, msg_id, data)
                await redis.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
            except Exception:
                logger.exception("notification_processing_failed", event_id=msg_id)
    # Devolve o que leu, não o que deu certo: quem chama usa isto para saber se
    # o stream secou. Contar só os sucessos faria um lote inteiro de falhas
    # parecer fim de fila, e a drenagem pararia cedo.
    return lidos


async def _consume_notification_stream(redis: aioredis.Redis, stop_event: asyncio.Event) -> None:
    """Consume events from the notifications Redis stream."""
    await _ensure_consumer_group(redis)

    logger.info("notification_consumer_started", stream=STREAM_KEY)

    while not stop_event.is_set():
        try:
            await _read_and_process_batch(redis, block_ms=5000)
        except Exception:
            if not stop_event.is_set():
                logger.exception("notification_consumer_error")
                await asyncio.sleep(5)


async def _process_single_reminder(redis: aioredis.Redis, entry: str) -> None:
    """Parse and process one meeting reminder entry from the sorted set."""
    from app.db.models.meeting import Meeting, MeetingRsvp, RsvpStatus
    from app.db.models.user import User
    from app.services.email import email_service

    parts = entry.rsplit(":", 1)
    if len(parts) != 2 or parts[1] not in ("24h", "1h"):
        await redis.zrem(MEETING_REMINDERS_KEY, entry)
        return

    meeting_id_str, time_label = parts
    try:
        meeting_id = uuid.UUID(meeting_id_str)
    except (ValueError, TypeError):
        await redis.zrem(MEETING_REMINDERS_KEY, entry)
        return

    async with AsyncSessionLocal() as db:
        meeting_result = await db.execute(
            select(Meeting).options(selectinload(Meeting.group)).where(Meeting.id == meeting_id)
        )
        meeting = meeting_result.scalar_one_or_none()

        if meeting is None:
            await redis.zrem(MEETING_REMINDERS_KEY, entry)
            return

        now_dt = datetime.now(UTC)
        scheduled = meeting.scheduled_at
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=UTC)
        else:
            scheduled = scheduled.astimezone(UTC)

        if scheduled <= now_dt:
            await redis.zrem(MEETING_REMINDERS_KEY, entry)
            return

        rsvps_result = await db.execute(
            select(User)
            .join(MeetingRsvp, MeetingRsvp.user_id == User.id)
            .where(
                MeetingRsvp.meeting_id == meeting_id,
                MeetingRsvp.status.in_([RsvpStatus.GOING, RsvpStatus.PENDING]),
                User.is_active.is_(True),
            )
        )
        users = list(rsvps_result.scalars().all())

        tl: Literal["24h", "1h"] = time_label  # type: ignore[assignment]

        async def _send(user: User) -> None:
            await email_service.send_meeting_reminder(user=user, meeting=meeting, time_until=tl)

        await _send_to_each(
            users,
            _send,
            event="meeting_reminder_email_failed",
            meeting_id=str(meeting_id),
        )

    await redis.zrem(MEETING_REMINDERS_KEY, entry)
    logger.info("meeting_reminder_sent", entry=entry)


async def _process_due_reminders(redis: aioredis.Redis) -> int:
    """Uma passada nos lembretes vencidos. Devolve quantos processou."""
    now_ts = time.time()
    due: list[str] = await redis.zrangebyscore(MEETING_REMINDERS_KEY, "-inf", now_ts, start=0, num=REMINDER_BATCH_SIZE)

    for entry in due:
        try:
            await _process_single_reminder(redis, entry)
        except Exception:
            logger.exception("meeting_reminder_processing_failed", entry=entry)
            await redis.zrem(MEETING_REMINDERS_KEY, entry)
    return len(due)


async def _poll_meeting_reminders(redis: aioredis.Redis, stop_event: asyncio.Event) -> None:
    """Poll the meeting_reminders sorted set and send reminder emails."""
    logger.info("meeting_reminder_poller_started")

    while not stop_event.is_set():
        try:
            await _process_due_reminders(redis)
        except Exception:
            if not stop_event.is_set():
                logger.exception("meeting_reminder_poller_error")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=REMINDER_POLL_INTERVAL)
        except TimeoutError:
            pass


async def _publish_heartbeat(redis: aioredis.Redis, stop_event: asyncio.Event) -> None:
    """Publish a heartbeat to Redis every HEARTBEAT_INTERVAL seconds."""
    logger.info("heartbeat_publisher_started")

    while not stop_event.is_set():
        try:
            timestamp = str(int(time.time()))
            await redis.set(HEARTBEAT_KEY, timestamp, ex=90)
            logger.debug("heartbeat_published", timestamp=timestamp)
        except Exception:
            logger.exception("heartbeat_publish_failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=HEARTBEAT_INTERVAL)
        except TimeoutError:
            pass


async def run() -> None:
    """Run the notification worker with all concurrent tasks."""
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    stop_event = asyncio.Event()

    def _shutdown(signum: int, frame: object) -> None:
        logger.info("notification_worker_shutting_down", signal=signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    logger.info("notification_worker_started")

    try:
        await asyncio.gather(
            _consume_notification_stream(redis, stop_event),
            _poll_meeting_reminders(redis, stop_event),
            _publish_heartbeat(redis, stop_event),
        )
    finally:
        await redis.aclose()
        logger.info("notification_worker_stopped")


async def run_once(*, heartbeat_ttl: int = ONCE_HEARTBEAT_TTL) -> None:
    """Drena o que houver acumulado e sai. É o modo do cron.

    Existe porque o plano free do Render não tem Background Worker e o daemon
    não tinha onde morar — então ninguém nunca o iniciou, e o
    `notification_worker` do /health reportava `heartbeat missing` desde sempre.

    Nada se perde entre execuções: o stream é lido por consumer group, então o
    que chega com o worker fora fica pendente e é entregue na próxima corrida.
    O preço é latência — o e-mail sai com até um intervalo de cron de atraso.

    O `heartbeat_ttl` é maior que o intervalo de propósito: para um job em lote,
    "vivo" quer dizer "rodou há pouco", não "está rodando agora". Com o TTL de
    90s do daemon, o /health passaria a maior parte do tempo dizendo `error`
    mesmo com tudo funcionando.
    """
    redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    logger.info("notification_worker_once_started")

    try:
        await redis.set(HEARTBEAT_KEY, str(int(time.time())), ex=heartbeat_ttl)
        await _ensure_consumer_group(redis)

        eventos = 0
        # Sem bloqueio: a corrida acaba quando o stream seca, em vez de esperar
        # por evento que não existe. O teto evita que uma enxurrada segure o job.
        for _ in range(ONCE_MAX_BATCHES):
            lote = await _read_and_process_batch(redis, block_ms=None)
            if lote == 0:
                break
            eventos += lote

        lembretes = await _process_due_reminders(redis)
        logger.info("notification_worker_once_finished", eventos=eventos, lembretes=lembretes)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Notification worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Drena o que houver e sai, em vez de rodar como daemon. Usado pelo cron.",
    )
    parser.add_argument(
        "--heartbeat-ttl",
        type=int,
        default=ONCE_HEARTBEAT_TTL,
        help=f"TTL do heartbeat no modo --once, em segundos (padrão {ONCE_HEARTBEAT_TTL}).",
    )
    args = parser.parse_args()

    asyncio.run(run_once(heartbeat_ttl=args.heartbeat_ttl) if args.once else run())
