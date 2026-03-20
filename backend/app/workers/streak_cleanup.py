"""Streak cleanup worker — resets streak_current for users who missed yesterday.

Run daily at 03:00 UTC via cron/scheduler:
    python -m app.workers.streak_cleanup
"""

from __future__ import annotations

import asyncio

import structlog

from app.db.engine import AsyncSessionLocal
from app.services.reading_progress import cleanup_expired_streaks

logger = structlog.get_logger(__name__)


async def main() -> None:
    """Execute streak cleanup and log results."""
    logger.info("streak_cleanup_started")
    async with AsyncSessionLocal() as db, db.begin():
        count = await cleanup_expired_streaks(db)
    logger.info("streak_cleanup_finished", users_reset=count)


if __name__ == "__main__":
    asyncio.run(main())
