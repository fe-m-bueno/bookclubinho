"""Account management — password and email change."""

from __future__ import annotations

import asyncio
import json
import secrets
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    import redis.asyncio as aioredis
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ServiceError
from app.core.security import hash_password, safe_compare, verify_password
from app.db.models.user import User
from app.services.email import send_email_change_email

logger = structlog.get_logger(__name__)

_EMAIL_CHANGE_TTL = 3600          # 1 hour
_EMAIL_CHANGE_RATE_MAX = 3        # max requests per 24h
_EMAIL_CHANGE_RATE_TTL = 86400    # 24 hours


class AccountError(ServiceError):
    """Raised when account operation validation fails."""


async def change_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    """Change password for a local auth user."""
    if user.auth_provider != "local":
        raise AccountError("Esta conta não usa senha.", status_code=403)

    if not user.hashed_password or not verify_password(current_password, user.hashed_password):
        raise AccountError("Senha atual incorreta.", status_code=400)

    if len(new_password) < 8:
        raise AccountError("Nova senha deve ter pelo menos 8 caracteres.")

    if verify_password(new_password, user.hashed_password):
        raise AccountError("Nova senha deve ser diferente da atual.")

    user.hashed_password = hash_password(new_password)
    logger.info("password_changed", user_id=str(user.id))


async def initiate_email_change(
    redis: aioredis.Redis,
    db: AsyncSession,
    user: User,
    new_email: str,
    current_password: str | None = None,
) -> None:
    """Initiate email change — sends confirmation email to new_email."""
    if user.auth_provider == "local":
        if not current_password:
            raise AccountError("Senha atual é obrigatória para alterar o e-mail.")
        if not user.hashed_password or not verify_password(current_password, user.hashed_password):
            raise AccountError("Senha atual incorreta.", status_code=400)

    if safe_compare(new_email.lower(), user.email.lower()):
        raise AccountError("O novo e-mail deve ser diferente do atual.")

    # Check email not already in use
    result = await db.execute(select(User).where(User.email == new_email))
    if result.scalar_one_or_none() is not None:
        raise AccountError("E-mail já está em uso.", status_code=409)

    # Rate limit: max 3 requests per 24h per user
    rate_key = f"email_change_rate:{user.id}"
    count_raw = await redis.get(rate_key)
    count = int(count_raw) if count_raw else 0
    if count >= _EMAIL_CHANGE_RATE_MAX:
        raise AccountError(
            "Muitas tentativas de troca de e-mail. Aguarde 24 horas.", status_code=429
        )

    # Generate and store token
    token = secrets.token_urlsafe(32)
    data = json.dumps({"user_id": str(user.id), "new_email": new_email})
    await redis.set(f"email_change:{token}", data, ex=_EMAIL_CHANGE_TTL)

    # Increment rate counter
    pipe = redis.pipeline()
    pipe.incr(rate_key)
    pipe.expire(rate_key, _EMAIL_CHANGE_RATE_TTL)
    await pipe.execute()

    confirm_url = f"{settings.APP_URL.rstrip('/')}/api/v1/auth/email/confirm?token={token}"
    display = user.display_name or user.username or user.email
    await asyncio.to_thread(send_email_change_email, new_email, display, confirm_url)

    logger.info("email_change_initiated", user_id=str(user.id))


async def confirm_email_change(
    redis: aioredis.Redis,
    db: AsyncSession,
    token: str,
) -> None:
    """Consume email change token and update user email."""
    data_raw = await redis.get(f"email_change:{token}")
    if data_raw is None:
        raise AccountError("Token inválido ou expirado.", status_code=400)

    # Consume token immediately (prevents replay)
    await redis.delete(f"email_change:{token}")

    data = json.loads(data_raw)
    user_id = data["user_id"]
    new_email = data["new_email"]

    # Re-check availability (race condition guard)
    result = await db.execute(select(User).where(User.email == new_email))
    if result.scalar_one_or_none() is not None:
        raise AccountError("E-mail já está em uso.", status_code=409)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise AccountError("Usuário não encontrado.", status_code=404)

    user.email = new_email
    logger.info("email_changed", user_id=user_id)
