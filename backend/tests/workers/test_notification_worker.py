"""Unit tests for app.workers.notification."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.notification import (
    CONSUMER_GROUP,
    CONSUMER_NAME,
    DIGEST_COOLDOWN_TTL,
    HEARTBEAT_INTERVAL,
    HEARTBEAT_KEY,
    STREAM_KEY,
    process_event,
)

# ── Constants ─────────────────────────────────────────────────────────────────


def test_constants_are_correct() -> None:
    assert STREAM_KEY == "bookclub:notifications"
    assert CONSUMER_GROUP == "notification-workers"
    assert CONSUMER_NAME == "worker-1"
    assert HEARTBEAT_KEY == "worker:notifications:heartbeat"
    assert HEARTBEAT_INTERVAL == 30
    assert DIGEST_COOLDOWN_TTL == 900


# ── process_event routing ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_process_event_routes_approaching_end() -> None:
    """process_event calls _handle_approaching_end for 'approaching_end' type."""
    redis_mock = AsyncMock()
    data = {
        "type": "approaching_end",
        "round_id": str(uuid.uuid4()),
        "group_id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "percentage": "85.0",
    }

    with patch("app.workers.notification._handle_approaching_end", new_callable=AsyncMock) as mock_handler:
        await process_event(redis_mock, "1-0", data)
        mock_handler.assert_called_once_with(data)


@pytest.mark.asyncio
async def test_process_event_routes_new_message() -> None:
    """process_event calls _handle_new_message for 'new_message' type."""
    redis_mock = AsyncMock()
    data = {
        "type": "new_message",
        "group_id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
    }

    with patch("app.workers.notification._handle_new_message", new_callable=AsyncMock) as mock_handler:
        await process_event(redis_mock, "2-0", data)
        mock_handler.assert_called_once_with(redis_mock, data)


@pytest.mark.asyncio
async def test_process_event_ignores_unknown_type(caplog: pytest.LogCaptureFixture) -> None:
    """process_event handles unknown event types without raising."""
    redis_mock = AsyncMock()
    data = {"type": "some_unknown_type"}

    # Should not raise
    with patch("app.workers.notification._handle_approaching_end"):
        with patch("app.workers.notification._handle_new_message"):
            await process_event(redis_mock, "3-0", data)


# ── _handle_approaching_end missing data ──────────────────────────────────────


@pytest.mark.asyncio
async def test_handle_approaching_end_missing_fields_returns_early() -> None:
    """_handle_approaching_end returns early when required fields are absent."""
    from app.workers.notification import _handle_approaching_end

    # No group_id or user_id
    data = {"type": "approaching_end", "round_id": str(uuid.uuid4())}

    # Should not raise or call DB
    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        await _handle_approaching_end(data)
        mock_session.assert_not_called()


@pytest.mark.asyncio
async def test_handle_approaching_end_invalid_uuid_returns_early() -> None:
    """_handle_approaching_end returns early for invalid UUID strings."""
    from app.workers.notification import _handle_approaching_end

    data = {
        "type": "approaching_end",
        "round_id": "not-a-uuid",
        "group_id": "not-a-uuid",
        "user_id": "not-a-uuid",
        "percentage": "85.0",
    }

    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        await _handle_approaching_end(data)
        mock_session.assert_not_called()


# ── _handle_new_message cooldown ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_handle_new_message_missing_fields_returns_early() -> None:
    """_handle_new_message returns early when required fields are absent."""
    from app.workers.notification import _handle_new_message

    redis_mock = AsyncMock()
    data = {"type": "new_message"}  # missing group_id, user_id, message_id

    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        await _handle_new_message(redis_mock, data)
        mock_session.assert_not_called()


@pytest.mark.asyncio
async def test_handle_new_message_cooldown_skips_email() -> None:
    """_handle_new_message skips sending if cooldown key exists in Redis."""
    from app.workers.notification import _handle_new_message

    group_id = uuid.uuid4()
    sender_id = uuid.uuid4()
    member_id = uuid.uuid4()
    message_id = uuid.uuid4()

    redis_mock = AsyncMock()
    # Cooldown is active
    redis_mock.get = AsyncMock(return_value="1")

    member_mock = MagicMock()
    member_mock.id = member_id
    member_mock.email_notifications = {"all_updates": True}
    member_mock.is_active = True

    data = {
        "type": "new_message",
        "group_id": str(group_id),
        "user_id": str(sender_id),
        "message_id": str(message_id),
    }

    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [member_mock]

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=members_result)

    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        # email_service is imported locally inside the handler;
        # patch at its canonical module location
        with patch("app.services.email.email_service") as mock_email:
            await _handle_new_message(redis_mock, data)
            # Cooldown active — email must NOT be sent
            mock_email.send_post_digest.assert_not_called()
