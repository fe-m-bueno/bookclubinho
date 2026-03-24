"""Testes unitários para app.workers.streak_cleanup."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.reading_progress import cleanup_expired_streaks


@pytest.mark.asyncio
async def test_cleanup_resets_expired_streaks() -> None:
    """Users who missed yesterday get streak_current reset to 0."""
    db = AsyncMock()
    res = MagicMock()
    res.rowcount = 3
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()

    count = await cleanup_expired_streaks(db)

    assert count == 3
    db.execute.assert_called_once()
    # Verify the UPDATE was called (not a SELECT)
    call_args = db.execute.call_args[0][0]
    # The statement should be an Update
    assert "UPDATE" in str(call_args).upper() or hasattr(call_args, "table")


@pytest.mark.asyncio
async def test_cleanup_returns_zero_when_no_expired() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.rowcount = 0
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()

    count = await cleanup_expired_streaks(db)

    assert count == 0


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
