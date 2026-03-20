"""Account deletion — anonymize + soft delete."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.security import verify_password
from app.db.models.user import User
from app.db.models.user_session import UserSession
from app.services.session import blacklist_jti

logger = structlog.get_logger(__name__)


class AccountDeletionError(ServiceError):
    pass


async def delete_account(
    db: "AsyncSession",
    redis: "aioredis.Redis",
    user: User,
    confirmation: str,
    current_password: str | None = None,
) -> None:
    """Anonymize and soft-delete the user account.

    For local accounts, requires current_password to confirm intent.
    Revokes all active sessions and blacklists their JTIs.
    """
    if confirmation != "EXCLUIR":
        raise AccountDeletionError("Confirmação inválida.", status_code=400)

    if user.auth_provider == "local":
        if not current_password:
            raise AccountDeletionError(
                "Informe sua senha para confirmar a exclusão.", status_code=400
            )
        if not user.hashed_password or not verify_password(
            current_password, user.hashed_password
        ):
            raise AccountDeletionError("Senha incorreta.", status_code=400)

    # Revoke all active sessions and blacklist JTIs in parallel
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        )
    )
    sessions = result.scalars().all()
    now = datetime.now(UTC)
    for s in sessions:
        s.revoked_at = now
    if sessions:
        await asyncio.gather(*[blacklist_jti(redis, s.refresh_token_jti) for s in sessions])

    # Anonymize PII
    anon_suffix = str(user.id)[:8]
    user.username = f"deleted_{anon_suffix}"
    user.display_name = None
    user.avatar_url = None
    user.status_text = None
    user.hardcover_token_encrypted = None
    user.auto_sync_hardcover = False

    # Soft delete — RLS will hide this user from all queries
    user.is_active = False

    logger.info("account_deleted", user_id=str(user.id))
