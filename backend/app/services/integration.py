"""Hardcover integration service — connect, disconnect, status, auto-sync toggle."""
from __future__ import annotations

import base64
import hashlib
from typing import TYPE_CHECKING

import httpx
import structlog

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ServiceError
from app.db.models.user import User

logger = structlog.get_logger(__name__)

_HARDCOVER_GQL_URL = "https://api.hardcover.app/v1/graphql"
_ME_QUERY = """query { me { id username } }"""


class IntegrationError(ServiceError):
    """Raised for integration-related failures."""


def _get_fernet():
    from cryptography.fernet import Fernet

    # Derive 32-byte key from JWT_SECRET via SHA-256, then base64url-encode
    key_bytes = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


async def connect_hardcover(db: "AsyncSession", user: User, token: str) -> str:
    """Validate Hardcover token, encrypt and store it. Returns hardcover username."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _HARDCOVER_GQL_URL,
            json={"query": _ME_QUERY},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    if resp.status_code != 200:
        raise IntegrationError("Token Hardcover inválido.", status_code=400)
    data = resp.json()
    me_data = (data.get("data") or {}).get("me")
    if not me_data:
        raise IntegrationError("Token Hardcover inválido.", status_code=400)
    hardcover_username: str = me_data.get("username") or ""
    fernet = _get_fernet()
    encrypted = fernet.encrypt(token.encode()).decode()
    user.hardcover_token_encrypted = encrypted
    logger.info("hardcover_connected", user_id=str(user.id), hardcover_username=hardcover_username)
    return hardcover_username


async def disconnect_hardcover(db: "AsyncSession", user: User) -> None:
    """Remove Hardcover token and disable auto-sync."""
    user.hardcover_token_encrypted = None
    user.auto_sync_hardcover = False
    logger.info("hardcover_disconnected", user_id=str(user.id))


async def get_hardcover_status(db: "AsyncSession", user: User) -> dict:
    """Return connection status and username if connected."""
    if not user.hardcover_token_encrypted:
        return {"connected": False, "hardcover_username": None}
    try:
        fernet = _get_fernet()
        token = fernet.decrypt(user.hardcover_token_encrypted.encode()).decode()
    except Exception:
        return {"connected": False, "hardcover_username": None}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _HARDCOVER_GQL_URL,
            json={"query": _ME_QUERY},
            headers={"Authorization": f"Bearer {token}"},
            timeout=5.0,
        )
    if resp.status_code != 200:
        return {"connected": False, "hardcover_username": None}
    me_data = (resp.json().get("data") or {}).get("me")
    if not me_data:
        return {"connected": False, "hardcover_username": None}
    return {"connected": True, "hardcover_username": me_data.get("username")}


async def toggle_auto_sync(db: "AsyncSession", user: User, enabled: bool) -> None:
    """Toggle auto-sync. Requires Hardcover to be connected."""
    if enabled and not user.hardcover_token_encrypted:
        raise IntegrationError(
            "Conecte o Hardcover antes de ativar a sincronização.", status_code=400
        )
    user.auto_sync_hardcover = enabled
    logger.info("hardcover_auto_sync_toggled", user_id=str(user.id), enabled=enabled)
