"""
Database seed script — populates local dev data.
Run via: make seed  (or: cd backend && python -m app.db.seed)
"""
import asyncio

import structlog

from app.db.engine import AsyncSessionLocal, engine, Base

logger = structlog.get_logger(__name__)


async def seed() -> None:
    # Ensure all tables exist (idempotent in dev — Alembic handles prod migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        logger.info("seed_started")

        # TODO: insert dev fixtures here, e.g.:
        # session.add(User(...))

        await session.commit()
        logger.info("seed_complete")


if __name__ == "__main__":
    asyncio.run(seed())
