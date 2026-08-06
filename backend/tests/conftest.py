"""Shared test helpers — imported automatically by pytest."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest


class RecordingAfterCommit:
    """Test adapter for the `AfterCommit` port — records instead of scheduling.

    Lets a test assert *which* effects a service scheduled. Before the port
    existed that was only observable by mounting the app and going through HTTP.
    """

    def __init__(self) -> None:
        self.scheduled: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

    def schedule(self, fn: Any, /, *args: Any, **kwargs: Any) -> None:
        self.scheduled.append((fn, args, kwargs))

    @property
    def event_types(self) -> list[str]:
        """Os nomes de evento de badge agendados, em ordem.

        Filtra por `str` porque o mesmo port carrega dois tipos de agendamento:
        `check_and_award_badges(user_id, "book_finished", ctx)`, cujo args[1] é o
        nome do evento, e `group_events.publish(group_id, GroupEvent(...))`, cujo
        args[1] é o evento. Para esse último use `published`.
        """
        return [args[1] for _fn, args, _kw in self.scheduled if len(args) > 1 and isinstance(args[1], str)]

    @property
    def published(self) -> list[str]:
        """Os tipos de GroupEvent agendados para publicação, em ordem."""
        return [
            args[1].type
            for _fn, args, _kw in self.scheduled
            if len(args) > 1 and hasattr(args[1], "type") and hasattr(args[1], "stream")
        ]


@pytest.fixture
def after_commit() -> RecordingAfterCommit:
    return RecordingAfterCommit()


class _Savepoint:
    """Dublê de `db.begin_nested()` com a semântica do savepoint de verdade.

    O que foi adicionado dentro do bloco some quando ele levanta, e a exceção
    continua subindo — é assim que o `except Exception` de quem chama consegue
    tratá-la sem que a transação de fora fique abortada.

    Um `AsyncMock` cru não serve: `begin_nested()` devolveria uma corrotina (não
    um context manager async) e, se devolvesse, o `__aexit__` do mock retorna um
    valor verdadeiro — engoliria toda exceção do bloco, o oposto do savepoint.
    """

    def __init__(self, session: object) -> None:
        self._session = session
        self._mark = 0

    async def __aenter__(self) -> _Savepoint:
        self._mark = len(getattr(self._session, "added", ()))
        return self

    async def __aexit__(self, exc_type: object, *_rest: object) -> bool:
        added = getattr(self._session, "added", None)
        if exc_type is not None and isinstance(added, list):
            del added[self._mark :]
        return False


class SavepointMixin:
    """Dá `begin_nested()` aos dublês de sessão escritos à mão."""

    def begin_nested(self) -> _Savepoint:
        return _Savepoint(self)


def with_savepoints(db: AsyncMock) -> AsyncMock:
    """Ensina um mock de sessão a responder `begin_nested()` como savepoint."""
    db.begin_nested = MagicMock(side_effect=lambda: _Savepoint(db))
    return db


def mock_db_returning(value: object) -> AsyncMock:
    """AsyncSession mock cujo execute() retorna scalar_one_or_none = value."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return with_savepoints(db)


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
