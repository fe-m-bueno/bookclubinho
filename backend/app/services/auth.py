"""Auth business logic — register, verify email, login."""

from __future__ import annotations

import asyncio
import hmac
import re
import secrets
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx
import structlog
from jose import JWTError, jwt
from sqlalchemy import select

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.core.security import (
    create_token_pair,
    decode_token,
    generate_magic_token,
    hash_password,
    verify_password,
)
from app.db.models.user import User
from app.db.models.user_session import UserSession
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

_RESEND_VERIFY_RATE_KEY_PREFIX = "resend_verify_rate:"
_RESEND_VERIFY_RATE_LIMIT = 3
_RESEND_VERIFY_RATE_TTL = 3600  # 1 hora

from app.core.constants import TOKEN_BLACKLIST_PREFIX as _TOKEN_BLACKLIST_PREFIX


async def _is_rate_limited(
    key_prefix: str, identifier: str, limit: int, ttl: int,
) -> bool:
    """Shared Redis INCR-based rate limiter. Returns True if over limit."""
    redis_client = get_redis()
    key = f"{key_prefix}{identifier}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, ttl)
    return count > limit


def _hash_token(token: str) -> str:
    """HMAC-SHA256 of a token keyed with JWT_SECRET — stored in Redis instead of plaintext."""
    return hmac.new(settings.JWT_SECRET.encode(), token.encode(), "sha256").hexdigest()


class AuthError(ServiceError):
    """Raised when credentials are invalid or the account is not ready."""

    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message, status_code)


# ── Session helpers ────────────────────────────────────────────────────────────

_IPV4_RE = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$")


def _parse_device_info(ua: str | None) -> str | None:
    """Extract a short, human-readable device description from a User-Agent string."""
    if not ua:
        return None
    return ua[:200]  # truncate to avoid storing huge UA strings


def _mask_ip(ip: str | None) -> str | None:
    """Mask the last octet of an IPv4 address; truncate IPv6 to /64 prefix."""
    if not ip:
        return None
    m = _IPV4_RE.match(ip)
    if m:
        return f"{m.group(1)}.{m.group(2)}.{m.group(3)}.*"
    # IPv6 — keep first 4 groups (64-bit prefix), mask the rest
    if ":" in ip:
        parts = ip.split(":")
        return ":".join(parts[:4]) + ":*"
    return ip


def _extract_jti_from_token(token: str) -> str | None:
    """Extract JTI from a JWT without validating expiry (used post-issuance)."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        return payload.get("jti")
    except JWTError:
        return None


async def _create_session(
    db: "AsyncSession",
    user_id: uuid.UUID,
    refresh_token: str,
    user_agent: str | None,
    client_ip: str | None,
) -> None:
    """Create a UserSession record. Silently swallows errors so login is not disrupted."""
    try:
        jti = _extract_jti_from_token(refresh_token)
        if not jti:
            return
        session = UserSession(
            user_id=user_id,
            refresh_token_jti=jti,
            device_info=_parse_device_info(user_agent),
            ip_address=_mask_ip(client_ip),
        )
        db.add(session)
        # flush so integrity errors surface before commit; caller handles commit
        await db.flush()
    except Exception as exc:  # noqa: BLE001
        logger.warning("session_create_failed", user_id=str(user_id), error=str(exc))
        await db.rollback()


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
        f"{settings.APP_URL.rstrip('/')}/auth/verify-email?token={token}"
    )

    redis_client = get_redis()
    await redis_client.set(
        f"{_VERIFY_KEY_PREFIX}{_hash_token(token)}",
        str(user.id),
        ex=_VERIFY_TOKEN_TTL,
    )

    await db.commit()

    # Send email after commit so the user row exists if delivery triggers a callback
    await asyncio.to_thread(
        send_verification_email,
        to_email=email_lower,
        display_name=clean_display_name or email_lower,
        verify_url=verify_url,
    )

    logger.info("user_registered", user_id=str(user.id))


# ── Resend verification ───────────────────────────────────────────────────────


async def resend_verification_email(db: AsyncSession, email: str) -> None:
    """Resend verification email.

    Returns silently in all cases to prevent email enumeration.
    """
    email_lower = email.lower().strip()

    if await _is_rate_limited(
        _RESEND_VERIFY_RATE_KEY_PREFIX, email_lower,
        _RESEND_VERIFY_RATE_LIMIT, _RESEND_VERIFY_RATE_TTL,
    ):
        logger.info("resend_verification_rate_limited", email=email_lower)
        return

    result = await db.execute(select(User).where(User.email == email_lower))
    user = result.scalar_one_or_none()

    if user is None or user.email_verified:
        logger.info("resend_verification_silenced", email=email_lower)
        return

    token = secrets.token_urlsafe(32)
    verify_url = f"{settings.APP_URL.rstrip('/')}/auth/verify-email?token={token}"

    redis = get_redis()
    await redis.set(
        f"{_VERIFY_KEY_PREFIX}{_hash_token(token)}",
        str(user.id),
        ex=_VERIFY_TOKEN_TTL,
    )

    await asyncio.to_thread(
        send_verification_email,
        to_email=email_lower,
        display_name=user.display_name or email_lower,
        verify_url=verify_url,
    )

    logger.info("resend_verification_sent", user_id=str(user.id))


# ── Verify email ──────────────────────────────────────────────────────────────


async def verify_email_token(db: AsyncSession, token: str) -> bool:
    """Consume a verification token and mark the user as verified.

    Returns True on success, False if token is invalid/expired.
    """
    redis_client = get_redis()
    key = f"{_VERIFY_KEY_PREFIX}{_hash_token(token)}"
    user_id_str = await redis_client.get(key)
    if not user_id_str:
        return False

    # Consume token immediately (idempotency)
    await redis_client.delete(key)

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

    if await _is_rate_limited(
        _MAGIC_RATE_KEY_PREFIX, email_lower,
        _MAGIC_RATE_LIMIT, _MAGIC_RATE_TTL,
    ):
        logger.info("magic_link_rate_limited", email=email_lower)
        return

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

    redis = get_redis()
    await redis.set(
        f"{_MAGIC_KEY_PREFIX}{_hash_token(token)}",
        str(user.id),
        ex=_MAGIC_TOKEN_TTL,
    )

    await db.commit()

    # Send email after commit so the user row is persisted
    await asyncio.to_thread(
        send_magic_link_email,
        to_email=email_lower,
        display_name=user.display_name or email_lower,
        magic_url=magic_url,
    )

    logger.info("magic_link_sent", user_id=str(user.id))


async def consume_magic_token(
    db: "AsyncSession",
    token: str,
    user_agent: str | None = None,
    client_ip: str | None = None,
) -> tuple[str, str, bool]:
    """Consome um magic token e retorna (access_token, refresh_token, onboarding_completed).

    Raises AuthError(400) para token inválido/expirado, UUID corrompido ou usuário inativo.
    """
    redis_client = get_redis()
    key = f"{_MAGIC_KEY_PREFIX}{_hash_token(token)}"
    user_id_str = await redis_client.get(key)
    if not user_id_str:
        raise AuthError("Token inválido ou expirado.", status_code=400)

    # Deleta ANTES do DB lookup para garantir one-time use
    await redis_client.delete(key)

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

    access_token, refresh_token = create_token_pair(
        str(user.id), onboarding_completed=user.onboarding_completed,
    )

    await _create_session(db, user.id, refresh_token, user_agent, client_ip)
    await db.commit()

    logger.info("magic_link_authenticated", user_id=str(user.id))
    return access_token, refresh_token, user.onboarding_completed


# ── Google OAuth2 ─────────────────────────────────────────────────────────────

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


async def google_oauth_callback(
    code: str,
    db: "AsyncSession",
    user_agent: str | None = None,
    client_ip: str | None = None,
) -> tuple[str, str, bool]:
    """Troca o authorization code do Google por tokens, faz upsert do usuário.

    Returns (access_token, refresh_token, onboarding_completed).
    Raises AuthError(400) para falhas no OAuth ou e-mail não verificado.
    """
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
                "code": code,
            },
        )

        if token_resp.status_code != 200:
            logger.warning("google_token_exchange_failed", status=token_resp.status_code)
            raise AuthError("Falha na autenticação via Google.", status_code=400)

        google_access_token = token_resp.json().get("access_token")

        userinfo_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )

    if userinfo_resp.status_code != 200:
        logger.warning("google_userinfo_failed", status=userinfo_resp.status_code)
        raise AuthError("Falha na autenticação via Google.", status_code=400)

    userinfo = userinfo_resp.json()
    email: str | None = userinfo.get("email")
    verified_email: bool = userinfo.get("verified_email", False)

    if not email or not verified_email:
        raise AuthError("E-mail do Google não verificado.", status_code=400)

    email_lower = email.lower().strip()
    raw_name: str = userinfo.get("name") or email_lower.split("@")[0]
    clean_name = sanitize(raw_name)
    avatar_url: str | None = userinfo.get("picture")

    result = await db.execute(select(User).where(User.email == email_lower))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=email_lower,
            hashed_password=None,
            display_name=clean_name,
            auth_provider="google",
            email_verified=True,
            avatar_url=avatar_url,
        )
        db.add(user)
        await db.flush()
        logger.info("google_oauth_new_user", email=email_lower)
    else:
        user.auth_provider = "google"
        if user.avatar_url is None:
            user.avatar_url = avatar_url
        logger.info("google_oauth_merged_user", user_id=str(user.id))

    user.last_login_at = datetime.now(UTC)

    access_token, refresh_token = create_token_pair(
        str(user.id), onboarding_completed=user.onboarding_completed,
    )

    await _create_session(db, user.id, refresh_token, user_agent, client_ip)
    await db.commit()

    return access_token, refresh_token, user.onboarding_completed


# ── Login ─────────────────────────────────────────────────────────────────────


async def authenticate_user(
    db: "AsyncSession",
    email: str,
    password: str,
    user_agent: str | None = None,
    client_ip: str | None = None,
) -> tuple[str, str]:
    """Authenticate user and return (access_token, refresh_token).

    Raises AuthError for any auth failure (single message to prevent enumeration).
    Optionally creates a UserSession record for session tracking.
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

    access_token, refresh_token = create_token_pair(
        str(user.id), onboarding_completed=user.onboarding_completed,
    )

    await _create_session(db, user.id, refresh_token, user_agent, client_ip)
    await db.commit()

    logger.info("user_logged_in", user_id=str(user.id))
    return access_token, refresh_token


# ── Token Blacklist & Rotation ────────────────────────────────────────────────


async def blacklist_refresh_token(token: str) -> None:
    """Invalida um refresh token adicionando seu JTI ao blacklist no Redis.

    Retorna silenciosamente se o token já for inválido ou expirado.
    """
    try:
        payload = decode_token(token)
    except JWTError:
        return

    jti: str | None = payload.get("jti")
    exp: int | None = payload.get("exp")

    if not jti or exp is None:
        return

    remaining_ttl = max(0, int(exp - datetime.now(UTC).timestamp()))
    if remaining_ttl <= 0:
        return

    redis_client = get_redis()
    await redis_client.set(f"{_TOKEN_BLACKLIST_PREFIX}{jti}", "1", ex=remaining_ttl)


async def rotate_refresh_token(
    token: str,
    db: "AsyncSession | None" = None,
) -> tuple[str, str]:
    """Valida o refresh token, verifica blacklist e emite novo par access+refresh.

    Raises AuthError(401) para token inválido, expirado, tipo errado ou revogado.
    Returns (new_access_token, new_refresh_token).

    When db is provided, updates the session's last_active_at and refresh_token_jti.
    """
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthError("Token inválido ou expirado.", status_code=401) from exc

    if payload.get("type") != "refresh":
        raise AuthError("Token inválido ou expirado.", status_code=401)

    jti: str | None = payload.get("jti")
    user_id: str | None = payload.get("sub")

    if not jti or not user_id:
        raise AuthError("Token inválido ou expirado.", status_code=401)

    redis_client = get_redis()
    is_blacklisted = await redis_client.get(f"{_TOKEN_BLACKLIST_PREFIX}{jti}")
    if is_blacklisted:
        raise AuthError("Token revogado.", status_code=401)

    # Blacklista o token atual antes de emitir o novo par
    exp: int | None = payload.get("exp")
    if exp is not None:
        remaining_ttl = max(0, int(exp - datetime.now(UTC).timestamp()))
        if remaining_ttl > 0:
            await redis_client.set(
                f"{_TOKEN_BLACKLIST_PREFIX}{jti}", "1", ex=remaining_ttl
            )

    new_access, new_refresh = create_token_pair(
        user_id, onboarding_completed=payload.get("onb", False),
    )

    # Update session record if db is available (best-effort — no crash on failure)
    if db is not None:
        try:
            new_jti = _extract_jti_from_token(new_refresh)
            if new_jti:
                result = await db.execute(
                    select(UserSession).where(
                        UserSession.refresh_token_jti == jti,
                        UserSession.revoked_at.is_(None),
                    )
                )
                session = result.scalar_one_or_none()
                if session is not None:
                    session.refresh_token_jti = new_jti
                    session.last_active_at = datetime.now(UTC)
        except Exception as exc:  # noqa: BLE001
            logger.warning("session_rotate_failed", jti=jti, error=str(exc))

    return new_access, new_refresh
