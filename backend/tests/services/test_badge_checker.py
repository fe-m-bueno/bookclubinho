"""Testes unitários para app.services.badge_checker."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest


def _mock_scalar_result(value: int) -> MagicMock:
    result = MagicMock()
    result.scalar_one.return_value = value
    return result


# ── _check_founder ─────────────────────────────────────────────────────────────


class TestCheckFounder:
    @pytest.mark.asyncio
    async def test_returns_true_when_user_has_one_group(self) -> None:
        """Retorna True quando o usuário criou pelo menos 1 grupo ativo."""
        from app.services.badge_checker import _check_founder

        user_id = uuid.uuid4()
        group_id = str(uuid.uuid4())
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(1))

        met, ctx = await _check_founder(db, user_id, {"group_id": group_id})

        assert met is True
        assert ctx["group_id"] == group_id

    @pytest.mark.asyncio
    async def test_returns_true_when_user_has_multiple_groups(self) -> None:
        """Retorna True quando o usuário criou mais de 1 grupo."""
        from app.services.badge_checker import _check_founder

        user_id = uuid.uuid4()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(3))

        met, _ = await _check_founder(db, user_id, {"group_id": str(uuid.uuid4())})

        assert met is True

    @pytest.mark.asyncio
    async def test_returns_false_when_user_has_no_groups(self) -> None:
        """Retorna False quando o usuário não criou nenhum grupo ativo."""
        from app.services.badge_checker import _check_founder

        user_id = uuid.uuid4()
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(0))

        met, _ = await _check_founder(db, user_id, {"group_id": str(uuid.uuid4())})

        assert met is False

    @pytest.mark.asyncio
    async def test_returns_false_when_scalar_is_none(self) -> None:
        """Retorna False quando scalar retorna None (tabela vazia)."""
        from app.services.badge_checker import _check_founder

        user_id = uuid.uuid4()
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one.return_value = None
        db.execute = AsyncMock(return_value=result)

        met, _ = await _check_founder(db, user_id, {})

        assert met is False
