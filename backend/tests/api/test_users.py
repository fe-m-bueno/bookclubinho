"""Testes unitários para os endpoints de users."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.conftest import mock_db_returning

# ── Endpoint: GET /users/check-username/{username} ──────────────────────────


class TestCheckUsernameEndpoint:
    @pytest.mark.asyncio
    async def test_available_username(self) -> None:
        from app.services.onboarding import check_username_available

        mock_db = mock_db_returning(None)  # no user found = available
        result = await check_username_available(db=mock_db, username="newuser")
        assert result is True

    @pytest.mark.asyncio
    async def test_taken_username(self) -> None:
        from app.services.onboarding import check_username_available

        existing = MagicMock()
        mock_db = mock_db_returning(existing)  # user found = taken
        result = await check_username_available(db=mock_db, username="takenuser")
        assert result is False
