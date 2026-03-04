"""Auth business logic — register, verify email, login."""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import redis.asyncio as aioredis
import structlog
from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_magic_token,
    hash_password,
    verify_password,
)
from app.db.models.user import User
from app.security.sanitizer import sanitize
from app.services.email import send_magic_link_email, send_verification_email

logger = structlog.get_logger(__name__)

_VERIFY_TOKEN_TTL = 86_400  # 24 h in seconds
_VERIFY_KEY_PREFIX = "verify:"

_MAGIC_TOKEN_TTL = 900  # 15 min
_MAGIC_KEY_PREFIX = "magic:"
_MAGIC_RATE_KEY_PREFIX = "magic_rate:"
_MAGIC_RATE_LIMIT = 5
_MAGIC_RATE_TTL = 3600  # 1 hora


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


class AuthError(Exception):
    """Raised when credentials are invalid or the account is not ready."""

    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.status_code = status_code


# ── Register ──────────────────────────────────────────────────────────────────


async def register_user(
    db: AsyncSession,
    email: str,
    password: str,
    display_name: str,
) -> None:
    """Create user and dispatch verification email.

    Returns silently whether or not the email already exists to prevent
    email enumeration (the caller always returns 201).
    """
    clean_display_name = sanitize(display_name)
    email_lower = email.lower().strip()

    # Check for existing email (silently no-op if duplicate — anti-enumeration)
    result = await db.execute(select(User).where(User.email == email_lower))
    existing = result.scalar_one_or_none()
    if existing is not None:
        logger.info("register_duplicate_email_silenced", email=email_lower)
        return

    user = User(
        id=uuid.uuid4(),
        email=email_lower,
        hashed_password=hash_password(password),
        display_name=clean_display_name,
        auth_provider="local",
        email_verified=False,
    )
    db.add(user)
    await db.flush()  # get the id without committing

    # Generate verification token and store in Redis
    token = secrets.token_urlsafe(32)
    verify_url = (
        f"{settings.APP_URL.rstrip('/')}/verify-email?token={token}"
    )

    redis_client = _redis()
    try:
        await redis_client.set(
            f"{_VERIFY_KEY_PREFIX}{token}",
            str(user.id),
            ex=_VERIFY_TOKEN_TTL,
        )
    finally:
        await redis_client.aclose()

    # Send email in background thread (Resend SDK is sync)
    await asyncio.to_thread(
        send_verification_email,
        to_email=email_lower,
        display_name=clean_display_name or email_lower,
        verify_url=verify_url,
    )

    await db.commit()
    logger.info("user_registered", user_id=str(user.id))


# ── Verify email ──────────────────────────────────────────────────────────────


async def verify_email_token(db: AsyncSession, token: str) -> bool:
    """Consume a verification token and mark the user as verified.

    Returns True on success, False if token is invalid/expired.
    """
    redis_client = _redis()
    try:
        key = f"{_VERIFY_KEY_PREFIX}{token}"
        user_id_str = await redis_client.get(key)
        if not user_id_str:
            return False

        # Consume token immediately (idempotency)
        await redis_client.delete(key)
    finally:
        await redis_client.aclose()

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        logger.warning("verify_email_invalid_uuid", raw=user_id_str)
        return False

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        logger.warning("verify_email_user_not_found", user_id=user_id_str)
        return False

    user.email_verified = True
    await db.commit()
    logger.info("email_verified", user_id=user_id_str)
    return True


# ── Magic Link ────────────────────────────────────────────────────────────────


async def send_magic_link(db: AsyncSession, email: str) -> None:
    """Solicita magic link para o e-mail informado.

    Cria o usuário se não existir (auth_provider='magic_link').
    Retorna silenciosamente em todos os casos — anti-enumeration.
    """
    email_lower = email.lower().strip()

    redis_client = _redis()
    try:
        rate_key = f"{_MAGIC_RATE_KEY_PREFIX}{email_lower}"
        count = await redis_client.incr(rate_key)
        if count == 1:
            await redis_client.expire(rate_key, _MAGIC_RATE_TTL)
        if count > _MAGIC_RATE_LIMIT:
            logger.info("magic_link_rate_limited", email=email_lower)
            return
    finally:
        await redis_client.aclose()

    result = await db.execute(select(User).where(User.email == email_lower))
    user = result.scalar_one_or_none()

    if user is None:
        display_name = sanitize(email_lower.split("@")[0])
        user = User(
            id=uuid.uuid4(),
            email=email_lower,
            hashed_password=None,
            display_name=display_name,
            auth_provider="magic_link",
            email_verified=True,
        )
        db.add(user)
        await db.flush()

    token = generate_magic_token()
    magic_url = f"{settings.APP_URL.rstrip('/')}/api/v1/auth/magic/callback?token={token}"

    redis_client = _redis()
    try:
        await redis_client.set(
            f"{_MAGIC_KEY_PREFIX}{token}",
            str(user.id),
            ex=_MAGIC_TOKEN_TTL,
        )
    finally:
        await redis_client.aclose()

    await asyncio.to_thread(
        send_magic_link_email,
        to_email=email_lower,
        display_name=user.display_name or email_lower,
        magic_url=magic_url,
    )

    await db.commit()
    logger.info("magic_link_sent", user_id=str(user.id))


async def consume_magic_token(
    db: AsyncSession, token: str
) -> tuple[str, str, bool]:
    """Consome um magic token e retorna (access_token, refresh_token, onboarding_completed).

    Raises AuthError(400) para token inválido/expirado, UUID corrompido ou usuário inativo.
    """
    redis_client = _redis()
    try:
        key = f"{_MAGIC_KEY_PREFIX}{token}"
        user_id_str = await redis_client.get(key)
        if not user_id_str:
            raise AuthError("Token inválido ou expirado.", status_code=400)

        # Deleta ANTES do DB lookup para garantir one-time use
        await redis_client.delete(key)
    finally:
        await redis_client.aclose()

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        logger.warning("magic_token_invalid_uuid", raw=user_id_str)
        raise AuthError("Token inválido ou expirado.", status_code=400) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise AuthError("Token inválido ou expirado.", status_code=400)

    user.last_login_at = datetime.now(UTC)
    await db.commit()

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    logger.info("magic_link_authenticated", user_id=str(user.id))
    return access_token, refresh_token, user.onboarding_completed


# ── Login ─────────────────────────────────────────────────────────────────────


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> tuple[str, str]:
    """Authenticate user and return (access_token, refresh_token).

    Raises AuthError for any auth failure (single message to prevent enumeration).
    """
    email_lower = email.lower().strip()

    result = await db.execute(select(User).where(User.email == email_lower))
    user = result.scalar_one_or_none()

    # Constant-time: always verify password even if user is None to prevent timing attacks
    dummy_hash = "$2b$12$notarealhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    hashed = user.hashed_password if (user and user.hashed_password) else dummy_hash
    password_ok = verify_password(password, hashed)

    if user is None or not password_ok:
        raise AuthError("Credenciais inválidas.")

    if not user.is_active:
        raise AuthError("Credenciais inválidas.")

    if not user.email_verified:
        raise AuthError("E-mail não verificado. Confira sua caixa de entrada.", status_code=403)

    # Update last login
    user.last_login_at = datetime.now(UTC)
    await db.commit()

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    logger.info("user_logged_in", user_id=str(user.id))
    return access_token, refresh_token
