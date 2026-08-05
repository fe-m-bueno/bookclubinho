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


def make_group(**overrides: object) -> MagicMock:
    """Cria um mock de Group com defaults sensíveis."""
    group = MagicMock()
    group.id = overrides.get("id", uuid.uuid4())
    group.name = overrides.get("name", "Clube de Teste")
    group.description = overrides.get("description")
    group.invite_code = overrides.get("invite_code", "ABCD1234")
    group.cover_url = overrides.get("cover_url")
    group.max_members = overrides.get("max_members", 8)
    group.is_active = overrides.get("is_active", True)
    group.created_by = overrides.get("created_by", uuid.uuid4())
    group.members = overrides.get("members", [])
    return group


def make_member(**overrides: object) -> MagicMock:
    """Cria um mock de GroupMember. role default = "member"."""
    member = MagicMock()
    member.user_id = overrides.get("user_id", uuid.uuid4())
    member.group_id = overrides.get("group_id", uuid.uuid4())
    member.role = overrides.get("role", "member")
    member.joined_at = overrides.get("joined_at")
    return member


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
