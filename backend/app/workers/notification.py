"""
Notification worker — consumes events from Redis Streams and dispatches
push notifications, emails, and in-app alerts.

Run standalone:
    python -m app.workers.notification
"""
import asyncio
import signal

import redis.asyncio as aioredis
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)

STREAM_KEY = "bookclub:notifications"
CONSUMER_GROUP = "notification-workers"
CONSUMER_NAME = "worker-1"


async def process_event(event_id: str, data: dict[str, str]) -> None:
    event_type = data.get("type", "unknown")
    logger.info("processing_notification", event_id=event_id, type=event_type)
    # TODO: dispatch based on event_type


async def run() -> None:
    redis = aioredis.from_url(settings.UPSTASH_REDIS_URL, decode_responses=True)

    # Ensure consumer group exists
    try:
        await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
    except Exception:
        pass  # group already exists

    logger.info("notification_worker_started", stream=STREAM_KEY)
    stop = False

    def _shutdown(signum: int, frame: object) -> None:
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    while not stop:
        results = await redis.xreadgroup(
            groupname=CONSUMER_GROUP,
            consumername=CONSUMER_NAME,
            streams={STREAM_KEY: ">"},
            count=10,
            block=5000,
        )
        for _stream, messages in results or []:
            for msg_id, data in messages:
                try:
                    await process_event(msg_id, data)
                    await redis.xack(STREAM_KEY, CONSUMER_GROUP, msg_id)
                except Exception:
                    logger.exception("notification_processing_failed", event_id=msg_id)

    await redis.aclose()
    logger.info("notification_worker_stopped")


if __name__ == "__main__":
    asyncio.run(run())
