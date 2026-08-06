"""Unit tests for app.workers.notification."""

from __future__ import annotations

import asyncio
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


# ── _send_to_each fan-out ─────────────────────────────────────────────────────


def _recipient(**attrs: object) -> MagicMock:
    """Build a stand-in User with a stable id."""
    recipient = MagicMock()
    recipient.id = attrs.pop("id", None) or uuid.uuid4()
    for key, value in attrs.items():
        setattr(recipient, key, value)
    return recipient


@pytest.mark.asyncio
async def test_send_to_each_runs_concurrently() -> None:
    """_send_to_each dispatches all recipients in parallel, not one after another."""
    from app.workers.notification import _send_to_each

    recipients = [_recipient() for _ in range(4)]
    in_flight = 0
    peak = 0

    async def send(_recipient_arg: object) -> None:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0)
        in_flight -= 1

    await _send_to_each(recipients, send, event="test_failed")

    assert peak == len(recipients)


@pytest.mark.asyncio
async def test_send_to_each_isolates_failures_and_logs_per_user() -> None:
    """One failing recipient does not stop the others; the failure is logged with its user_id."""
    from app.workers.notification import _send_to_each

    ok_a, boom, ok_b = _recipient(), _recipient(), _recipient()
    delivered: list[uuid.UUID] = []

    async def send(recipient: MagicMock) -> None:
        if recipient is boom:
            raise RuntimeError("resend is down")
        delivered.append(recipient.id)

    with patch("app.workers.notification.logger") as mock_logger:
        await _send_to_each([ok_a, boom, ok_b], send, event="digest_email_failed")

    assert delivered == [ok_a.id, ok_b.id]
    mock_logger.error.assert_called_once()
    _args, kwargs = mock_logger.error.call_args
    assert _args[0] == "digest_email_failed"
    assert kwargs["user_id"] == str(boom.id)
    assert isinstance(kwargs["exc_info"], RuntimeError)


@pytest.mark.asyncio
async def test_send_to_each_forwards_extra_log_fields() -> None:
    """Extra log fields (e.g. meeting_id) reach the failure log."""
    from app.workers.notification import _send_to_each

    boom = _recipient()
    meeting_id = str(uuid.uuid4())

    async def send(_recipient_arg: object) -> None:
        raise RuntimeError("nope")

    with patch("app.workers.notification.logger") as mock_logger:
        await _send_to_each([boom], send, event="meeting_reminder_email_failed", meeting_id=meeting_id)

    assert mock_logger.error.call_args.kwargs["meeting_id"] == meeting_id


# ── _handle_new_message digest cooldown ───────────────────────────────────────


def _digest_db(members: list[MagicMock]) -> AsyncMock:
    """AsyncSession stub answering the message, group and recipients queries in order."""
    msg = MagicMock()
    msg.content_text = "oi pessoal"
    msg_result = MagicMock()
    msg_result.scalar_one_or_none.return_value = msg

    group = MagicMock()
    group.name = "Clubinho"
    group_result = MagicMock()
    group_result.scalar_one_or_none.return_value = group

    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = members

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[msg_result, group_result, members_result])
    return db


@pytest.mark.asyncio
async def test_handle_new_message_failed_recipient_keeps_no_cooldown() -> None:
    """A recipient whose digest failed must not be marked on cooldown; the others still receive."""
    from app.workers.notification import DIGEST_COOLDOWN_TTL, _handle_new_message

    group_id = uuid.uuid4()
    sender_id = uuid.uuid4()
    prefs = {"all_updates": True}
    ok_a = _recipient(email_notifications=prefs)
    boom = _recipient(email_notifications=prefs)
    ok_b = _recipient(email_notifications=prefs)

    redis_mock = AsyncMock()
    redis_mock.mget = AsyncMock(return_value=[None, None, None])

    data = {
        "type": "new_message",
        "group_id": str(group_id),
        "user_id": str(sender_id),
        "message_id": str(uuid.uuid4()),
    }

    sent: list[uuid.UUID] = []

    async def send_post_digest(*, user: MagicMock, **_kwargs: object) -> None:
        if user is boom:
            raise RuntimeError("resend is down")
        sent.append(user.id)

    mock_db = _digest_db([ok_a, boom, ok_b])

    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.email.email_service") as mock_email:
            mock_email.send_post_digest = AsyncMock(side_effect=send_post_digest)
            await _handle_new_message(redis_mock, data)

    # The two healthy recipients got their digest…
    assert sorted(map(str, sent)) == sorted([str(ok_a.id), str(ok_b.id)])

    # …and only they were put on cooldown. The failed one stays eligible.
    cooldown_keys = {call.args[0] for call in redis_mock.setex.await_args_list}
    assert cooldown_keys == {
        f"digest_cooldown:{ok_a.id}:{group_id}",
        f"digest_cooldown:{ok_b.id}:{group_id}",
    }
    assert f"digest_cooldown:{boom.id}:{group_id}" not in cooldown_keys
    for call in redis_mock.setex.await_args_list:
        assert call.args[1] == DIGEST_COOLDOWN_TTL


@pytest.mark.asyncio
async def test_handle_new_message_skips_members_already_on_cooldown() -> None:
    """mget hits are filtered out before the fan-out."""
    from app.workers.notification import _handle_new_message

    group_id = uuid.uuid4()
    prefs = {"all_updates": True}
    cooled, fresh = _recipient(email_notifications=prefs), _recipient(email_notifications=prefs)

    redis_mock = AsyncMock()
    redis_mock.mget = AsyncMock(return_value=["1", None])

    data = {
        "type": "new_message",
        "group_id": str(group_id),
        "user_id": str(uuid.uuid4()),
        "message_id": str(uuid.uuid4()),
    }

    mock_db = _digest_db([cooled, fresh])

    with patch("app.workers.notification.AsyncSessionLocal") as mock_session:
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.email.email_service") as mock_email:
            mock_email.send_post_digest = AsyncMock()
            await _handle_new_message(redis_mock, data)

    recipients = [call.kwargs["user"] for call in mock_email.send_post_digest.await_args_list]
    assert recipients == [fresh]


# ── _group_recipients ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_group_recipients_excludes_author_and_inactive() -> None:
    """The single recipients query filters by group, excludes the author and inactive users."""
    from app.db.models.user import User
    from app.workers.notification import _group_recipients

    group_id = uuid.uuid4()
    exclude_id = uuid.uuid4()

    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    assert await _group_recipients(db, group_id, exclude_id) == []

    stmt = str(db.execute.await_args.args[0])
    assert "JOIN group_members" in stmt
    assert "group_members.group_id" in stmt
    assert "users.id !=" in stmt
    assert "users.is_active" in stmt
    assert db.execute.await_args.args[0].column_descriptions[0]["entity"] is User
