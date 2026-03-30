from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_database_url(url: str) -> str:
    """
    Normalize provider-issued PostgreSQL URLs for SQLAlchemy async + asyncpg.

    - Converts postgres:// and postgresql:// to postgresql+asyncpg://
    - Rewrites sslmode=require to ssl=require for asyncpg compatibility
    - Drops channel_binding, which asyncpg does not accept as a connect kwarg
    """
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)

    parts = urlsplit(url)
    query_pairs = parse_qsl(parts.query, keep_blank_values=True)
    normalized_pairs: list[tuple[str, str]] = []
    ssl_value: str | None = None

    for key, value in query_pairs:
        if key == "sslmode":
            ssl_value = value
            continue
        if key == "channel_binding":
            continue
        normalized_pairs.append((key, value))

    if ssl_value and not any(key == "ssl" for key, _ in normalized_pairs):
        normalized_pairs.append(("ssl", ssl_value))

    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(normalized_pairs),
            parts.fragment,
        )
    )
