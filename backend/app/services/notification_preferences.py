"""Service for managing user notification preferences."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.notification import NotificationPreferencesUpdate

from app.db.models.user import User

_DEFAULTS: dict[str, bool] = {
    "meetings": True,
    "invites": True,
    "auth": True,
    "approaching_end": False,
    "all_updates": False,
}


def _merged_prefs(user: User) -> dict[str, bool]:
    """Merge user's stored preferences with defaults, keeping only known keys."""
    return {**_DEFAULTS, **{k: bool(v) for k, v in user.email_notifications.items() if k in _DEFAULTS}}


async def get_notification_preferences(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict[str, bool]:
    """Return user's email_notifications merged with defaults."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return dict(_DEFAULTS)
    return _merged_prefs(user)


async def update_notification_preferences(
    db: AsyncSession,
    user_id: uuid.UUID,
    payload: NotificationPreferencesUpdate,
) -> dict[str, bool]:
    """Partial update of user's notification preferences. 'auth' is always True."""
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if user is None:
        return dict(_DEFAULTS)

    prefs = _merged_prefs(user)

    update_data = payload.model_dump(exclude_none=True)
    # 'auth' cannot be disabled — always stays True
    update_data.pop("auth", None)
    prefs.update({k: bool(v) for k, v in update_data.items()})

    # Force auth = True always
    prefs["auth"] = True

    user.email_notifications = prefs
    await db.flush()
    await db.refresh(user)

    return prefs
