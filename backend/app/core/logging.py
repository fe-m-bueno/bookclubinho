import logging
import re
import sys
from typing import Any

import structlog

# ── PII masking patterns ──────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# Chaves cujos valores devem ser completamente redactados
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "hashed_password",
        "token",
        "access_token",
        "refresh_token",
        "csrf_token",
        "secret",
        "api_key",
        "authorization",
        "cookie",
        "jwt",
        "magic_url",
        "verify_url",
    }
)


def _mask_email(value: str) -> str:
    """Substitui endereços de email por u***@***.com."""
    return _EMAIL_RE.sub(lambda m: _mask_email_addr(m.group(0)), value)


def _mask_email_addr(email: str) -> str:
    parts = email.split("@")
    if len(parts) != 2:
        return "***@***.***"
    domain_parts = parts[1].rsplit(".", 1)
    tld = domain_parts[1] if len(domain_parts) == 2 else "***"
    return f"u***@***.{tld}"


def _pii_filter_processor(
    logger: Any, method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Structlog processor que mascara PII antes de emitir o log."""
    sanitized: dict[str, Any] = {}
    for key, value in event_dict.items():
        key_lower = key.lower()
        if key_lower in _SENSITIVE_KEYS:
            sanitized[key] = "[REDACTED]"
        elif isinstance(value, str):
            sanitized[key] = _mask_email(value) if "@" in value else value
        else:
            sanitized[key] = value
    return sanitized


# ── configure_logging ─────────────────────────────────────────────────────────


def configure_logging(debug: bool = False) -> None:
    log_level = logging.DEBUG if debug else logging.INFO

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            _pii_filter_processor,
            structlog.dev.ConsoleRenderer() if debug else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger("bookclub")
