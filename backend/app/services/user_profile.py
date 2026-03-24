"""User profile business logic — update, avatar upload/delete, public profile."""

from __future__ import annotations

import asyncio
import uuid
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select

if TYPE_CHECKING:
    from fastapi import UploadFile
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.badge import Badge, UserBadge
from app.db.models.user import User
from app.schemas.user import UserUpdate
from app.security.sanitizer import sanitize
from app.services.onboarding import check_username_available
from app.storage.s3_storage import delete_file, upload_file

logger = structlog.get_logger(__name__)

_MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB
_MAX_PROFILE_BADGES = 12


class ProfileError(ServiceError):
    """Raised when profile update validation fails."""


async def update_user_profile(
    db: AsyncSession,
    user: User,
    payload: UserUpdate,
) -> User:
    """Apply a partial profile update from UserUpdate payload."""
    changed_fields: list[str] = []

    if payload.username is not None:
        username = sanitize(payload.username).strip()
        available = await check_username_available(db=db, username=username, exclude_user_id=user.id)
        if not available:
            raise ProfileError("Username já está em uso.", status_code=409)
        user.username = username
        changed_fields.append("username")

    if payload.display_name is not None:
        user.display_name = sanitize(payload.display_name).strip()
        changed_fields.append("display_name")

    if payload.status_text is not None:
        user.status_text = sanitize(payload.status_text).strip() or None
        changed_fields.append("status_text")

    if payload.preferred_genres is not None:
        user.preferred_genres = payload.preferred_genres
        changed_fields.append("preferred_genres")

    if payload.timezone is not None:
        user.timezone = payload.timezone
        changed_fields.append("timezone")

    if changed_fields:
        logger.info("profile_updated", user_id=str(user.id), fields=changed_fields)

    return user


async def upload_user_avatar(
    db: AsyncSession,
    user: User,
    avatar: UploadFile,
) -> str:
    """Process and upload avatar; return new avatar_url."""
    data = await avatar.read()
    if len(data) > _MAX_AVATAR_SIZE:
        raise ProfileError("Avatar deve ter no máximo 5MB.")

    content_type = avatar.content_type or "image/png"
    bucket_path = f"avatars/{user.id}.webp"
    avatar_url: str = await asyncio.to_thread(upload_file, bucket_path, data, content_type)
    user.avatar_url = avatar_url

    logger.info("avatar_uploaded", user_id=str(user.id))
    return avatar_url


async def delete_user_avatar(db: AsyncSession, user: User) -> None:
    """Remove avatar from storage and clear avatar_url."""
    bucket_path = f"avatars/{user.id}.webp"
    await asyncio.to_thread(delete_file, bucket_path)
    user.avatar_url = None
    logger.info("avatar_deleted", user_id=str(user.id))


async def get_public_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict:
    """Return enriched public profile for a user.

    Raises ProfileError(404) if user not found or inactive.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise ProfileError("Usuário não encontrado.", status_code=404)

    # Count finished books via BookReview (one review per finished book)
    from app.db.models.book_review import BookReview  # local import to avoid circular

    count_result = await db.execute(select(func.count()).select_from(BookReview).where(BookReview.user_id == user.id))
    total_books_finished = count_result.scalar_one() or 0

    # Fetch up to 12 most recent badges
    badges_result = await db.execute(
        select(Badge.slug, Badge.emoji)
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user.id)
        .order_by(UserBadge.earned_at.desc())
        .limit(_MAX_PROFILE_BADGES)
    )
    badges = [{"slug": row.slug, "emoji": row.emoji} for row in badges_result]

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "status_text": user.status_text,
        "preferred_genres": user.preferred_genres,
        "streak_current": user.streak_current,
        "streak_longest": user.streak_longest,
        "total_reading_time_minutes": user.total_reading_time_minutes,
        "timezone": user.timezone,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "total_books_finished": total_books_finished,
        "badges": badges,
    }


async def get_public_profile_by_username(
    db: AsyncSession,
    username: str,
    viewer_id: uuid.UUID | None = None,
) -> dict:
    """Return enriched public profile for a user by username (case-insensitive).

    Raises ProfileError(404) if user not found or inactive.
    Includes shared_group_count when viewer_id is provided and differs from target.
    """
    result = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise ProfileError("Usuário não encontrado.", status_code=404)

    profile = await get_public_profile(db=db, user_id=user.id)

    shared_group_count = 0
    if viewer_id is not None and viewer_id != user.id:
        from app.services.shared_groups import get_shared_groups

        shared = await get_shared_groups(db=db, viewer_id=viewer_id, target_user_id=user.id)
        shared_group_count = len(shared)

    return {**profile, "shared_group_count": shared_group_count}
