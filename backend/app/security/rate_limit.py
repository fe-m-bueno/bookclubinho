"""Rate limiting with hybrid key strategy.

Authenticated endpoints use user ID as key (via RLS ContextVar — no extra JWT decode).
Unauthenticated endpoints use IP + route path as key.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.rls import get_rls_user_id

if TYPE_CHECKING:
    from starlette.requests import Request


def _get_rate_limit_key(request: Request) -> str:
    """Hybrid rate-limit key: user_id for authenticated, IP+path for anonymous."""
    user_id = get_rls_user_id()
    if user_id:
        return f"user:{user_id}"
    ip = get_remote_address(request)
    return f"ip:{ip}:{request.url.path}"


limiter = Limiter(key_func=_get_rate_limit_key, default_limits=["200/minute"])
