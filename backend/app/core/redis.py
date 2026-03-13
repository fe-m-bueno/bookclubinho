"""Singleton Redis connection pool — shared across the application."""

from __future__ import annotations

import redis.asyncio as aioredis

from app.core.config import settings

_pool: aioredis.ConnectionPool | None = None
_client: aioredis.Redis | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Return (or create) the global Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
        )
    return _pool


def get_redis() -> aioredis.Redis:
    """Return a cached Redis client backed by the shared pool."""
    global _client
    if _client is None:
        _client = aioredis.Redis(connection_pool=get_redis_pool())
    return _client


async def close_redis_pool() -> None:
    """Gracefully close the pool on application shutdown."""
    global _pool, _client
    _client = None
    if _pool is not None:
        await _pool.disconnect()
        _pool = None
