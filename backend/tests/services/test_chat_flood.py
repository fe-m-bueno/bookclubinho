"""Testes para flood protection e dedup no serviço de chat."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.services.chat import ChatError, _check_flood


def _make_redis(*, incr_value: int = 1, dedup_set_result: str | None = "OK") -> AsyncMock:
    redis = AsyncMock()
    redis.set.return_value = dedup_set_result  # None = key existed (duplicate)
    redis.incr.return_value = incr_value
    redis.expire = AsyncMock()
    return redis


@pytest.fixture
def group_id():
    return uuid.uuid4()


@pytest.fixture
def user_id():
    return uuid.uuid4()


class TestFloodProtection:
    @pytest.mark.asyncio
    async def test_first_message_sets_flood_key_expire(self, user_id, group_id) -> None:
        redis = _make_redis(incr_value=1)
        with patch("app.services.chat.get_redis", return_value=redis):
            await _check_flood(user_id, group_id, "abc123")
        redis.expire.assert_called_once()

    @pytest.mark.asyncio
    async def test_within_limit_does_not_raise(self, user_id, group_id) -> None:
        redis = _make_redis(incr_value=10)
        with patch("app.services.chat.get_redis", return_value=redis):
            # Should not raise at exactly 10
            await _check_flood(user_id, group_id, "abc123")

    @pytest.mark.asyncio
    async def test_over_limit_raises_429(self, user_id, group_id) -> None:
        redis = _make_redis(incr_value=11)
        with patch("app.services.chat.get_redis", return_value=redis):
            with pytest.raises(ChatError) as exc_info:
                await _check_flood(user_id, group_id, "abc123")
        assert exc_info.value.status_code == 429
        assert "Muitas mensagens" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_duplicate_content_raises_429(self, user_id, group_id) -> None:
        # redis.set returns None when key already exists (nx=True condition not met)
        redis = _make_redis(dedup_set_result=None, incr_value=1)
        with patch("app.services.chat.get_redis", return_value=redis):
            with pytest.raises(ChatError) as exc_info:
                await _check_flood(user_id, group_id, "abc123")
        assert exc_info.value.status_code == 429
        assert "duplicada" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_expire_only_called_on_first_incr(self, user_id, group_id) -> None:
        redis = _make_redis(incr_value=5)
        with patch("app.services.chat.get_redis", return_value=redis):
            await _check_flood(user_id, group_id, "abc123")
        # expire should NOT be called when count > 1
        redis.expire.assert_not_called()
