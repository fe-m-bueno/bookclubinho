"""Schemas for notification preferences."""

from __future__ import annotations

from pydantic import BaseModel


class EmailNotificationPreferences(BaseModel):
    meetings: bool
    invites: bool
    auth: bool
    approaching_end: bool
    all_updates: bool


class NotificationPreferencesUpdate(BaseModel):
    """Partial update for notification preferences. 'auth' cannot be disabled."""

    meetings: bool | None = None
    invites: bool | None = None
    approaching_end: bool | None = None
    all_updates: bool | None = None
