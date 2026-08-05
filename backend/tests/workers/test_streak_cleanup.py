"""Testes unitários para app.workers.streak_cleanup."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.reading_progress import cleanup_expired_streaks


def _cleanup_db(timezones: list[str], rowcount: int) -> AsyncMock:
    """db mock: 1 SELECT dos timezones distintos, depois 1 UPDATE por timezone."""
    tz_res = MagicMock()
    tz_res.scalars.return_value.all.return_value = timezones
    upd_res = MagicMock()
    upd_res.rowcount = rowcount

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[tz_res, *[upd_res] * len(timezones)])
    db.flush = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_cleanup_resets_expired_streaks() -> None:
    """Users who missed yesterday get streak_current reset to 0."""
    db = _cleanup_db(["America/Sao_Paulo"], rowcount=3)

    count = await cleanup_expired_streaks(db)

    assert count == 3
    # O último statement é um UPDATE, não um SELECT
    last_stmt = db.execute.await_args.args[0]
    assert "UPDATE" in str(last_stmt).upper() or hasattr(last_stmt, "table")


@pytest.mark.asyncio
async def test_cleanup_returns_zero_when_no_expired() -> None:
    db = _cleanup_db(["America/Sao_Paulo"], rowcount=0)

    count = await cleanup_expired_streaks(db)

    assert count == 0


@pytest.mark.asyncio
async def test_cleanup_with_no_users_does_no_updates() -> None:
    db = _cleanup_db([], rowcount=0)

    count = await cleanup_expired_streaks(db)

    assert count == 0
    assert db.execute.await_count == 1  # só o SELECT dos timezones


@pytest.mark.asyncio
async def test_streak_cleanup_worker_main_runs() -> None:
    """The worker main() should call cleanup and commit."""
    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=False)

    mock_begin = AsyncMock()
    mock_begin.__aenter__ = AsyncMock(return_value=mock_begin)
    mock_begin.__aexit__ = AsyncMock(return_value=False)
    mock_db.begin = MagicMock(return_value=mock_begin)

    res = MagicMock()
    res.rowcount = 2
    mock_db.execute = AsyncMock(return_value=res)
    mock_db.flush = AsyncMock()

    mock_session_local = MagicMock(return_value=mock_db)

    with (
        patch("app.workers.streak_cleanup.AsyncSessionLocal", mock_session_local),
        patch(
            "app.workers.streak_cleanup.cleanup_expired_streaks", new_callable=AsyncMock, return_value=2
        ) as mock_cleanup,
    ):
        from app.workers.streak_cleanup import main

        await main()

    mock_cleanup.assert_called_once()
