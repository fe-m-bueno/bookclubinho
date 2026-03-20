"""Shared test helpers — imported automatically by pytest."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock


def mock_db_returning(value: object) -> AsyncMock:
    """AsyncSession mock cujo execute() retorna scalar_one_or_none = value."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def make_user(**overrides: object) -> MagicMock:
    """Cria um mock de User com defaults sensíveis (superset de todos os campos)."""
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.status_text = overrides.get("status_text")
    user.preferred_genres = overrides.get("preferred_genres", ["fantasia"])
    user.onboarding_completed = overrides.get("onboarding_completed", False)
    user.is_active = overrides.get("is_active", True)
    user.hardcover_token_encrypted = overrides.get("hardcover_token_encrypted")
    user.auto_sync_hardcover = overrides.get("auto_sync_hardcover", False)
    user.auth_provider = overrides.get("auth_provider", "local")
    return user
