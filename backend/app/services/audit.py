"""Audit log service — registra eventos de segurança e de negócio."""

from __future__ import annotations

import hashlib
import uuid
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from fastapi import Request
    from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

# ── Constantes de ação ────────────────────────────────────────────────────────

# Auth
LOGIN_SUCCESS = "login_success"
LOGIN_FAILED = "login_failed"
LOGOUT = "logout"
REGISTER = "register"
MAGIC_LINK_SENT = "magic_link_sent"
MAGIC_LINK_USED = "magic_link_used"
OAUTH_LOGIN = "oauth_login"
TOKEN_REFRESH = "token_refresh"
SESSION_REVOKED = "session_revoked"
ACCOUNT_LOCKED = "account_locked"

# Conta
PASSWORD_CHANGED = "password_changed"
EMAIL_CHANGED = "email_changed"
DATA_EXPORTED = "data_exported"
ACCOUNT_DELETED = "account_deleted"

# Grupos
GROUP_CREATED = "group_created"
GROUP_JOINED = "group_joined"
GROUP_LEFT = "group_left"
GROUP_DELETED = "group_deleted"
MEMBER_REMOVED = "member_removed"
MEMBER_PROMOTED = "member_promoted"
CODE_REGENERATED = "code_regenerated"

# Rodadas
ROUND_CREATED = "round_created"
VOTE_CAST = "vote_cast"
ROUND_FINALIZED = "round_finalized"

# Conteúdo
MESSAGE_DELETED = "message_deleted"
MESSAGE_REPORTED = "message_reported"
MEDIA_UPLOADED = "media_uploaded"


def _hash_ip(ip: str | None) -> str | None:
    """SHA-256 do IP — permite correlação sem armazenar o IP real."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _extract_request_meta(request: Request | None) -> tuple[str | None, str | None]:
    """Extrai ip_hash e user_agent truncado de um Request do FastAPI."""
    if request is None:
        return None, None
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    return _hash_ip(ip), (ua[:200] if ua else None)


async def log_event(
    db: AsyncSession,
    action: str,
    *,
    user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
    ip_hash: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Registra um evento no audit_log de forma fire-and-forget.

    Nunca levanta exceção — falha silenciosamente para não interromper a requisição.
    Passe `request` para extrair ip_hash e user_agent automaticamente,
    ou passe-os explicitamente se o request não estiver disponível.
    """
    try:
        if request is not None:
            ip_hash, user_agent = _extract_request_meta(request)

        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            metadata_=metadata,
        )
        db.add(entry)
        # Não faz commit aqui — o caller é responsável pelo commit da transação
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "audit_log_failed",
            action=action,
            user_id=str(user_id) if user_id else None,
            error=str(exc),
        )
