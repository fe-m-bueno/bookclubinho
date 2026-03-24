"""Onboarding business logic — profile setup, preferences, completion."""

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
from app.db.models.user import User
from app.schemas.onboarding import USERNAME_REGEX, VALID_GENRE_SLUGS
from app.security.sanitizer import sanitize
from app.storage.s3_storage import upload_file

logger = structlog.get_logger(__name__)

_MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB


class OnboardingError(ServiceError):
    """Raised when onboarding validation fails."""


async def check_username_available(
    db: AsyncSession,
    username: str,
    exclude_user_id: uuid.UUID | None = None,
) -> bool:
    """Check if a username is available (case-insensitive).

    Optionally exclude a specific user_id so existing owners don't block themselves.
    """
    stmt = select(User).where(func.lower(User.username) == username.lower())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is None


async def update_profile(
    db: AsyncSession,
    user: User,
    username: str,
    display_name: str,
    status_text: str | None = None,
    avatar: UploadFile | None = None,
) -> None:
    """Update user profile during onboarding."""
    # Sanitize inputs
    username = sanitize(username).strip()
    display_name = sanitize(display_name).strip()

    # Validate username
    if not USERNAME_REGEX.match(username):
        raise OnboardingError(
            "Username deve começar com letra, ter 3-20 caracteres e conter apenas letras, números e _."
        )

    # Check uniqueness case-insensitive (exclude self)
    result = await db.execute(
        select(User).where(
            func.lower(User.username) == username.lower(),
            User.id != user.id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise OnboardingError("Username já está em uso.")

    # Validate display_name
    if len(display_name) < 2:
        raise OnboardingError("Nome deve ter pelo menos 2 caracteres.")
    if len(display_name) > 50:
        raise OnboardingError("Nome deve ter no máximo 50 caracteres.")

    # Validate status_text
    if status_text is not None:
        status_text = sanitize(status_text).strip()
        if len(status_text) > 100:
            raise OnboardingError("Status deve ter no máximo 100 caracteres.")

    # Handle avatar upload
    if avatar is not None:
        data = await avatar.read()
        if len(data) > _MAX_AVATAR_SIZE:
            raise OnboardingError("Avatar deve ter no máximo 5MB.")

        content_type = avatar.content_type or "image/png"
        bucket_path = f"avatars/{user.id}.webp"
        avatar_url = await asyncio.to_thread(upload_file, bucket_path, data, content_type)
        user.avatar_url = avatar_url

    user.username = username
    user.display_name = display_name
    user.status_text = status_text

    logger.info("onboarding_profile_updated", user_id=str(user.id))


async def update_preferences(
    db: AsyncSession,
    user: User,
    preferred_genres: list[str],
) -> None:
    """Update user preferred genres during onboarding."""
    invalid = [s for s in preferred_genres if s not in VALID_GENRE_SLUGS]
    if invalid:
        raise OnboardingError(f"Gêneros inválidos: {', '.join(invalid)}")

    user.preferred_genres = preferred_genres

    logger.info("onboarding_preferences_updated", user_id=str(user.id))


async def complete_onboarding(db: AsyncSession, user: User) -> None:
    """Mark onboarding as complete after validating required fields."""
    if not user.username:
        raise OnboardingError("Username é obrigatório para completar o onboarding.")
    if not user.display_name:
        raise OnboardingError("Nome é obrigatório para completar o onboarding.")
    if not user.preferred_genres or len(user.preferred_genres) < 1:
        raise OnboardingError("Selecione pelo menos 1 gênero para completar o onboarding.")

    user.onboarding_completed = True

    logger.info("onboarding_completed", user_id=str(user.id))
