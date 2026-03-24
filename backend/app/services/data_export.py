"""Data export — collect user data, upload to R2, email download link."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.exceptions import ServiceError
from app.db.models.badge import Badge, UserBadge
from app.db.models.book_review import BookReview
from app.db.models.group import Group, GroupMember
from app.db.models.user import User
from app.services.email import send_data_export_email
from app.storage.s3_storage import _client, _ensure_bucket  # noqa: PLC2701

logger = structlog.get_logger(__name__)

_COOLDOWN_KEY_PREFIX = "data_export_cooldown:"
_COOLDOWN_SECONDS = 86400  # 24h


class DataExportError(ServiceError):
    pass


async def request_data_export(
    redis: aioredis.Redis,
    db: AsyncSession,
    user: User,
) -> dict:
    """Collect user data, upload to R2 (presigned), send email. Returns message + cooldown_until."""
    cooldown_key = f"{_COOLDOWN_KEY_PREFIX}{user.id}"
    ttl = await redis.ttl(cooldown_key)
    if ttl > 0:
        cooldown_until = datetime.now(UTC) + timedelta(seconds=ttl)
        return {
            "message": ("Você já solicitou uma exportação recentemente. Aguarde o período de espera."),
            "cooldown_until": cooldown_until,
        }

    profile_data = {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "preferred_genres": user.preferred_genres,
        "streak_current": user.streak_current,
        "streak_longest": user.streak_longest,
        "total_reading_time_minutes": user.total_reading_time_minutes,
        "timezone": user.timezone,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    # Groups
    groups_result = await db.execute(
        select(Group.id, Group.name)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == user.id, Group.is_active.is_(True))
    )
    groups_data = [{"id": str(r.id), "name": r.name} for r in groups_result]

    # Reviews
    reviews_result = await db.execute(select(BookReview).where(BookReview.user_id == user.id))
    reviews = reviews_result.scalars().all()
    reviews_data = [
        {
            "id": str(r.id),
            "book_id": r.book_id,
            "rating": r.rating,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reviews
    ]

    # Badges
    badges_result = await db.execute(
        select(Badge.slug, Badge.emoji)
        .join(UserBadge, UserBadge.badge_id == Badge.id)
        .where(UserBadge.user_id == user.id)
    )
    badges_data = [{"slug": r.slug, "emoji": r.emoji} for r in badges_result]

    export = {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": profile_data,
        "groups": groups_data,
        "reviews": reviews_data,
        "badges": badges_data,
    }

    export_json = json.dumps(export, ensure_ascii=False, indent=2).encode("utf-8")

    bucket_path = f"exports/{user.id}/{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}_export.json"

    def _do_upload() -> str:
        _ensure_bucket()
        client = _client()
        client.put_object(
            Bucket=app_settings.S3_BUCKET_NAME,
            Key=bucket_path,
            Body=export_json,
            ContentType="application/json",
        )
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": app_settings.S3_BUCKET_NAME, "Key": bucket_path},
            ExpiresIn=86400,
        )

    download_url: str = await asyncio.to_thread(_do_upload)

    # Set cooldown
    await redis.set(cooldown_key, "1", ex=_COOLDOWN_SECONDS)
    cooldown_until = datetime.now(UTC) + timedelta(seconds=_COOLDOWN_SECONDS)

    # Send email (non-blocking — if email fails, export is still done)
    try:
        await asyncio.to_thread(
            send_data_export_email,
            to_email=user.email,
            display_name=user.display_name or user.email,
            download_url=download_url,
        )
    except Exception:
        logger.warning("data_export_email_failed", user_id=str(user.id))

    logger.info("data_export_requested", user_id=str(user.id))
    return {
        "message": "Exportação solicitada. Você receberá um link por e-mail em breve.",
        "cooldown_until": cooldown_until,
    }
