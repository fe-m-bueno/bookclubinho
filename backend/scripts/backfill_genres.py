"""Script one-time: popula book_genres em rounds que já têm livro definido.

Uso:
    cd backend
    .venv/bin/python scripts/backfill_genres.py

O script é idempotente — pula rounds que já têm book_genres preenchido.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Garante que o pacote app está no path quando rodado direto
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.models.round import Round, RoundNomination, RoundStatus
from app.services.hardcover import HardcoverClient

logger = structlog.get_logger(__name__)

_BATCH_SIZE = 20
_ACTIVE_STATUSES = (RoundStatus.READING, RoundStatus.REVIEWING, RoundStatus.FINISHED)


async def _backfill(db: AsyncSession) -> None:
    client = HardcoverClient()
    try:
        # Busca rounds sem gênero que já têm um livro selecionado
        stmt = (
            select(Round.id, Round.book_id)
            .where(
                Round.book_genres.is_(None),
                Round.book_id.isnot(None),
                Round.status.in_(_ACTIVE_STATUSES),
            )
        )
        result = await db.execute(stmt)
        round_rows = result.all()

        if not round_rows:
            logger.info("backfill_genres_nothing_to_do")
            return

        logger.info("backfill_genres_start", total=len(round_rows))

        # Para cada round, busca o slug via nomination vencedora (mesmo book_id)
        updated = 0
        errors = 0

        for i in range(0, len(round_rows), _BATCH_SIZE):
            batch = round_rows[i : i + _BATCH_SIZE]

            for round_id, book_id in batch:
                # Pega slug da nomination que corresponde ao livro vencedor
                slug_stmt = select(RoundNomination.book_hardcover_slug).where(
                    RoundNomination.round_id == round_id,
                    RoundNomination.book_id == book_id,
                    RoundNomination.book_hardcover_slug.isnot(None),
                )
                slug_result = await db.execute(slug_stmt)
                slug = slug_result.scalar_one_or_none()

                if not slug:
                    logger.debug("backfill_genres_no_slug", round_id=str(round_id))
                    continue

                try:
                    detail = await client.get_book(slug)
                except Exception as exc:
                    logger.warning(
                        "backfill_genres_hardcover_error",
                        round_id=str(round_id),
                        slug=slug,
                        exc=str(exc),
                    )
                    errors += 1
                    continue

                if not detail or not detail.genres:
                    logger.debug(
                        "backfill_genres_no_genres", round_id=str(round_id), slug=slug
                    )
                    continue

                await db.execute(
                    update(Round)
                    .where(Round.id == round_id)
                    .values(book_genres=detail.genres)
                )
                updated += 1
                logger.info(
                    "backfill_genres_updated",
                    round_id=str(round_id),
                    genres=detail.genres,
                )

            await db.commit()
            logger.info("backfill_genres_batch_committed", batch_end=i + len(batch))

        logger.info(
            "backfill_genres_done",
            total=len(round_rows),
            updated=updated,
            errors=errors,
        )
    finally:
        await client.aclose()


async def main() -> None:
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        await _backfill(db)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
