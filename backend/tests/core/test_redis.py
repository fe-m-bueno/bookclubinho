"""Tests for the Redis connection pool singleton."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.core import redis as redis_module
from app.core.redis import close_redis_pool, get_redis, get_redis_pool


class TestRedisPool:
    def setup_method(self) -> None:
        """Reset the global pool and client between tests."""
        redis_module._pool = None
        redis_module._client = None

    def teardown_method(self) -> None:
        redis_module._pool = None
        redis_module._client = None

    @patch("app.core.redis.settings")
    def test_get_redis_pool_creates_singleton(self, mock_settings: object) -> None:
        mock_settings.REDIS_URL = "redis://localhost:6379"  # type: ignore[attr-defined]
        pool1 = get_redis_pool()
        pool2 = get_redis_pool()
        assert pool1 is pool2

    @patch("app.core.redis.settings")
    def test_get_redis_returns_cached_client(self, mock_settings: object) -> None:
        mock_settings.REDIS_URL = "redis://localhost:6379"  # type: ignore[attr-defined]
        client1 = get_redis()
        client2 = get_redis()
        assert client1 is client2

    @pytest.mark.asyncio
    async def test_close_redis_pool_resets_global(self) -> None:
        redis_module._pool = None
        await close_redis_pool()
        assert redis_module._pool is None
        assert redis_module._client is None

    @pytest.mark.asyncio
    @patch("app.core.redis.settings")
    async def test_close_redis_pool_disconnects(self, mock_settings: object) -> None:
        from unittest.mock import AsyncMock, MagicMock

        mock_settings.REDIS_URL = "redis://localhost:6379"  # type: ignore[attr-defined]
        mock_pool = MagicMock()
        mock_pool.disconnect = AsyncMock()
        redis_module._pool = mock_pool

        await close_redis_pool()

        mock_pool.disconnect.assert_awaited_once()
        assert redis_module._pool is None
        assert redis_module._client is None
