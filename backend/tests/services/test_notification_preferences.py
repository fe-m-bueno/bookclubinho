"""Unit tests for app.services.notification_preferences."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.notification import NotificationPreferencesUpdate
from app.services.notification_preferences import (
    get_notification_preferences,
    update_notification_preferences,
)


def _make_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.email_notifications = overrides.get(
        "email_notifications",
        {
            "meetings": True,
            "invites": True,
            "auth": True,
            "approaching_end": False,
            "all_updates": False,
        },
    )
    return user


def _mock_db(user: MagicMock | None) -> AsyncMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ── get_notification_preferences ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_notification_preferences_returns_merged_defaults() -> None:
    """Returns user prefs merged with defaults."""
    user = _make_user(
        email_notifications={"meetings": False, "invites": True, "auth": True}
    )
    db = _mock_db(user)

    prefs = await get_notification_preferences(db=db, user_id=user.id)

    assert prefs["meetings"] is False
    assert prefs["invites"] is True
    assert prefs["auth"] is True
    # Keys from defaults that were not in the user's stored value are filled in
    assert "approaching_end" in prefs
    assert "all_updates" in prefs


@pytest.mark.asyncio
async def test_get_notification_preferences_user_not_found_returns_defaults() -> None:
    """When user is None, returns default preferences dict."""
    db = _mock_db(None)

    prefs = await get_notification_preferences(db=db, user_id=uuid.uuid4())

    assert prefs["auth"] is True
    assert prefs["meetings"] is True


# ── update_notification_preferences ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_notification_preferences_partial_update() -> None:
    """Only provided fields are updated; others remain unchanged."""
    user = _make_user(
        email_notifications={
            "meetings": True,
            "invites": True,
            "auth": True,
            "approaching_end": False,
            "all_updates": False,
        }
    )
    db = _mock_db(user)

    payload = NotificationPreferencesUpdate(approaching_end=True)
    result = await update_notification_preferences(db=db, user_id=user.id, payload=payload)

    assert result["approaching_end"] is True
    assert result["meetings"] is True  # unchanged
    assert result["auth"] is True      # always True


@pytest.mark.asyncio
async def test_update_notification_preferences_auth_always_true() -> None:
    """The 'auth' key is always set to True even if not explicitly provided."""
    user = _make_user(
        email_notifications={
            "meetings": True,
            "invites": True,
            "auth": True,
            "approaching_end": False,
            "all_updates": False,
        }
    )
    db = _mock_db(user)

    payload = NotificationPreferencesUpdate(all_updates=True)
    result = await update_notification_preferences(db=db, user_id=user.id, payload=payload)

    assert result["auth"] is True


@pytest.mark.asyncio
async def test_update_notification_preferences_user_not_found_returns_defaults() -> None:
    """When user is None, returns default preferences dict without crashing."""
    db = _mock_db(None)

    payload = NotificationPreferencesUpdate(meetings=False)
    result = await update_notification_preferences(db=db, user_id=uuid.uuid4(), payload=payload)

    # Returns defaults
    assert result["auth"] is True
    assert isinstance(result, dict)


# ── Schema validation ──────────────────────────────────────────────────────────


def test_notification_preferences_update_schema_accepts_partial() -> None:
    """Schema allows all fields to be None (full partial update)."""
    schema = NotificationPreferencesUpdate()
    assert schema.meetings is None
    assert schema.invites is None
    assert schema.approaching_end is None
    assert schema.all_updates is None


def test_notification_preferences_update_schema_does_not_expose_auth_field() -> None:
    """The 'auth' field is not exposed in the update schema (server-side only)."""
    schema = NotificationPreferencesUpdate()
    # auth is not a field on the update schema — it is always forced True server-side
    assert not hasattr(schema, "auth")


def test_notification_preferences_update_schema_set_meetings_false() -> None:
    """meetings can be set to False."""
    schema = NotificationPreferencesUpdate(meetings=False)
    assert schema.meetings is False
