"""Testes para o audit log service."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.audit import (
    LOGIN_FAILED,
    LOGIN_SUCCESS,
    _hash_ip,
    log_event,
)


class TestHashIp:
    def test_none_returns_none(self) -> None:
        assert _hash_ip(None) is None

    def test_returns_16_char_hash(self) -> None:
        result = _hash_ip("192.168.1.1")
        assert result is not None
        assert len(result) == 16

    def test_same_ip_same_hash(self) -> None:
        assert _hash_ip("10.0.0.1") == _hash_ip("10.0.0.1")

    def test_different_ips_different_hashes(self) -> None:
        assert _hash_ip("1.2.3.4") != _hash_ip("5.6.7.8")


class TestLogEvent:
    @pytest.mark.asyncio
    async def test_creates_audit_log_entry(self) -> None:
        db = AsyncMock()
        db.add = MagicMock()

        await log_event(db, LOGIN_SUCCESS, user_id=uuid.uuid4())

        db.add.assert_called_once()
        entry = db.add.call_args[0][0]
        assert entry.action == LOGIN_SUCCESS

    @pytest.mark.asyncio
    async def test_with_resource(self) -> None:
        db = AsyncMock()
        db.add = MagicMock()
        rid = uuid.uuid4()

        await log_event(
            db,
            "group_created",
            user_id=uuid.uuid4(),
            resource_type="group",
            resource_id=rid,
            metadata={"name": "Test Club"},
        )

        entry = db.add.call_args[0][0]
        assert entry.resource_type == "group"
        assert entry.resource_id == rid
        assert entry.metadata_["name"] == "Test Club"

    @pytest.mark.asyncio
    async def test_extracts_request_meta(self) -> None:
        db = AsyncMock()
        db.add = MagicMock()

        mock_request = MagicMock()
        mock_request.client.host = "1.2.3.4"
        mock_request.headers.get.return_value = "Mozilla/5.0"

        await log_event(db, LOGIN_FAILED, request=mock_request)

        entry = db.add.call_args[0][0]
        assert entry.ip_hash is not None
        assert len(entry.ip_hash) == 16
        assert entry.user_agent == "Mozilla/5.0"

    @pytest.mark.asyncio
    async def test_swallows_exceptions_silently(self) -> None:
        """log_event nunca deve deixar a requisição falhar."""
        db = AsyncMock()
        db.add = MagicMock(side_effect=RuntimeError("DB gone"))

        # Não deve levantar exceção
        await log_event(db, LOGIN_SUCCESS)

    @pytest.mark.asyncio
    async def test_user_id_optional(self) -> None:
        """Eventos de sistema não têm user_id."""
        db = AsyncMock()
        db.add = MagicMock()

        await log_event(db, "system_event")

        entry = db.add.call_args[0][0]
        assert entry.user_id is None

    @pytest.mark.asyncio
    async def test_no_commit_called(self) -> None:
        """log_event não deve fazer commit — responsabilidade do caller."""
        db = AsyncMock()
        db.add = MagicMock()

        await log_event(db, LOGIN_SUCCESS)

        db.commit.assert_not_called()
