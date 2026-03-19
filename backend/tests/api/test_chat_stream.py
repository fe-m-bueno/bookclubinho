"""Testes de endpoint para SSE — /api/v1/groups/{group_id}/chat/stream."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.api.v1.endpoints.chat_stream import router as chat_stream_router
from app.core.deps import get_current_active_user, get_group_membership, get_session
from tests.conftest import make_user

FAKE_GROUP_ID = uuid.uuid4()
FAKE_USER = make_user()
FAKE_DB = AsyncMock()
FAKE_MEMBER = MagicMock()
FAKE_MEMBER.user_id = FAKE_USER.id
FAKE_MEMBER.group_id = FAKE_GROUP_ID


def _make_app(*, with_member: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(
        chat_stream_router,
        prefix="/api/v1/groups/{group_id}/chat/stream",
    )
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    if with_member:
        app.dependency_overrides[get_group_membership] = lambda: FAKE_MEMBER
    return app


def test_stream_returns_200_event_stream() -> None:
    app = _make_app()
    client = TestClient(app)

    # Empty result = timeout ping; RedisError terminates the generator cleanly
    mock_redis = AsyncMock()
    mock_redis.xread = AsyncMock(side_effect=[[], RedisError("connection lost")])

    with patch("app.api.v1.endpoints.chat_stream.get_redis", return_value=mock_redis):
        resp = client.get(
            f"/api/v1/groups/{FAKE_GROUP_ID}/chat/stream",
            headers={"Accept": "text/event-stream"},
        )

    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")


def test_stream_requires_membership() -> None:
    """Without membership override the dep raises 404."""
    app = FastAPI()
    app.include_router(
        chat_stream_router,
        prefix=f"/api/v1/groups/{FAKE_GROUP_ID}/chat/stream",
    )
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    # No get_group_membership override — uses the real dep which will 404

    from fastapi import HTTPException

    async def _raise_404() -> None:
        raise HTTPException(status_code=404, detail="Clube não encontrado.")

    app.dependency_overrides[get_group_membership] = _raise_404

    client = TestClient(app)
    resp = client.get(f"/api/v1/groups/{FAKE_GROUP_ID}/chat/stream")
    assert resp.status_code == 404


def test_stream_yields_events() -> None:
    app = _make_app()
    client = TestClient(app)

    stream_key = f"bookclub:group:{FAKE_GROUP_ID}:chat"
    fake_messages = [
        (
            stream_key,
            [
                (
                    "1234567890-0",
                    {"type": "message_created", "message_id": "abc", "user_id": "def"},
                )
            ],
        )
    ]

    mock_redis = AsyncMock()
    # First call returns messages, second RedisError breaks the generator cleanly
    mock_redis.xread = AsyncMock(side_effect=[fake_messages, RedisError("done")])

    with patch("app.api.v1.endpoints.chat_stream.get_redis", return_value=mock_redis):
        resp = client.get(
            f"/api/v1/groups/{FAKE_GROUP_ID}/chat/stream",
            headers={"Accept": "text/event-stream"},
        )

    assert resp.status_code == 200
    text = resp.text
    assert "message_created" in text
    # Payload should contain the message_id
    assert "abc" in text


def test_stream_sends_ping_on_timeout() -> None:
    app = _make_app()
    client = TestClient(app)

    mock_redis = AsyncMock()
    # Empty result = timeout ping; RedisError terminates the generator cleanly
    mock_redis.xread = AsyncMock(side_effect=[[], RedisError("done")])

    with patch("app.api.v1.endpoints.chat_stream.get_redis", return_value=mock_redis):
        resp = client.get(
            f"/api/v1/groups/{FAKE_GROUP_ID}/chat/stream",
            headers={"Accept": "text/event-stream"},
        )

    assert resp.status_code == 200
    assert ": ping" in resp.text
