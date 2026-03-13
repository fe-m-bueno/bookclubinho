import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


_RESERVED_CLAIMS = frozenset({"sub", "exp", "type", "jti"})


def _safe_extra(extra_claims: dict[str, Any] | None) -> dict[str, Any]:
    if not extra_claims:
        return {}
    return {k: v for k, v in extra_claims.items() if k not in _RESERVED_CLAIMS}


def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        **_safe_extra(extra_claims),
        "sub": str(subject),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str | Any,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    expire = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        **_safe_extra(extra_claims),
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_token_pair(
    subject: str,
    *,
    onboarding_completed: bool,
) -> tuple[str, str]:
    """Cria par access+refresh com claim de onboarding."""
    claims = {"onb": onboarding_completed}
    return (
        create_access_token(subject, extra_claims=claims),
        create_refresh_token(subject, extra_claims=claims),
    )


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def extract_access_token_sub(token: str) -> str | None:
    """Decode an access JWT and return the ``sub`` claim, or None on any failure."""
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def safe_compare(a: str, b: str) -> bool:
    """Constant-time string comparison to prevent timing attacks."""
    return hmac.compare_digest(a.encode(), b.encode())


# Excludes ambiguous chars: 0, O, 1, I, L
_GROUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_group_code() -> str:
    """Generate a cryptographically secure 8-char invite code, excluding ambiguous characters."""
    return "".join(secrets.choice(_GROUP_CODE_ALPHABET) for _ in range(8))


def generate_magic_token() -> str:
    """Generate a cryptographically secure URL-safe token for magic link auth."""
    return secrets.token_urlsafe(32)
