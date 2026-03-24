"""Testes unitários para app.services.badge."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.badge import (
    BadgeError,
    get_badge_catalog,
    get_badge_progress,
    get_group_badges,
    get_my_badges,
)

# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_badge(**overrides: object) -> MagicMock:
    b = MagicMock()
    b.id = overrides.get("id", uuid.uuid4())
    b.slug = overrides.get("slug", "bookworm")
    b.name = overrides.get("name", "Bookworm")
    b.description = overrides.get("description", "Leu 5 livros")
    b.emoji = overrides.get("emoji", "📚")
    b.category = overrides.get("category", "reading")
    return b


def _make_user_badge(**overrides: object) -> MagicMock:
    ub = MagicMock()
    ub.id = overrides.get("id", uuid.uuid4())
    ub.user_id = overrides.get("user_id", uuid.uuid4())
    ub.badge_id = overrides.get("badge_id", uuid.uuid4())
    ub.earned_at = overrides.get("earned_at", datetime(2026, 3, 1, tzinfo=UTC))
    return ub


def _make_user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid.uuid4())
    u.username = overrides.get("username", "leitora")
    u.display_name = overrides.get("display_name", "Leitora Teste")
    u.avatar_url = overrides.get("avatar_url")
    return u


# ── get_badge_catalog ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_badge_catalog_empty() -> None:
    """Nenhum badge cadastrado — retorna lista vazia."""
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=res)

    result = await get_badge_catalog(db)

    assert result == []


@pytest.mark.asyncio
async def test_get_badge_catalog_returns_badges() -> None:
    """Badges cadastrados — retorna lista com campos corretos."""
    badge = _make_badge(slug="bookworm", name="Bookworm", category="reading")

    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [badge]
    db.execute = AsyncMock(return_value=res)

    result = await get_badge_catalog(db)

    assert len(result) == 1
    entry = result[0]
    assert entry["slug"] == "bookworm"
    assert entry["name"] == "Bookworm"
    assert entry["category"] == "reading"
    assert entry["earned_at"] is None
    assert entry["group_name"] is None
    assert entry["book_title"] is None


# ── get_my_badges ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_my_badges_no_badges() -> None:
    """Usuário sem badges — retorna dicionário vazio."""
    user_id = uuid.uuid4()

    db = AsyncMock()
    res = MagicMock()
    res.all.return_value = []
    db.execute = AsyncMock(return_value=res)

    result = await get_my_badges(db, user_id=user_id)

    assert result == {}


@pytest.mark.asyncio
async def test_get_my_badges_groups_by_category() -> None:
    """Badges agrupados por categoria no resultado."""
    from datetime import UTC, datetime

    user_id = uuid.uuid4()

    # O serviço usa colunas escalares (Badge.slug, Badge.name, ...), não joins ORM.
    # O resultado é um Row com atributos nomeados.
    row = MagicMock()
    row.slug = "bookworm"
    row.name = "Rato de Biblioteca"
    row.description = "Finalizou 5 livros com o clube"
    row.emoji = "🐛"
    row.category = "reading"
    row.earned_at = datetime(2026, 1, 1, tzinfo=UTC)
    row.group_name = "Clube A"
    row.book_title = "O Hobbit"

    db = AsyncMock()
    res = MagicMock()
    res.all.return_value = [row]
    db.execute = AsyncMock(return_value=res)

    result = await get_my_badges(db, user_id=user_id)

    assert "reading" in result
    assert len(result["reading"]) == 1
    assert result["reading"][0]["slug"] == "bookworm"
    assert result["reading"][0]["group_name"] == "Clube A"
    assert result["reading"][0]["book_title"] == "O Hobbit"


# ── get_group_badges ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_group_badges_empty() -> None:
    """Grupo sem membros — retorna lista vazia."""
    group_id = uuid.uuid4()

    db = AsyncMock()
    res_members = MagicMock()
    res_members.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=res_members)

    result = await get_group_badges(db, group_id=group_id)

    assert result == []


@pytest.mark.asyncio
async def test_get_group_badges_member_with_no_badges() -> None:
    """Membro sem badges no grupo — entrada com lista de badges vazia."""
    group_id = uuid.uuid4()
    user = _make_user()

    db = AsyncMock()

    res_members = MagicMock()
    res_members.scalars.return_value.all.return_value = [user]

    res_badges = MagicMock()
    res_badges.all.return_value = []

    db.execute = AsyncMock(side_effect=[res_members, res_badges])

    result = await get_group_badges(db, group_id=group_id)

    assert len(result) == 1
    assert result[0]["user_id"] == str(user.id)
    assert result[0]["badges"] == []


# ── get_badge_progress ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_badge_progress_unknown_slug() -> None:
    """Slug desconhecido — levanta BadgeError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(BadgeError) as exc_info:
        await get_badge_progress(db, user_id=uuid.uuid4(), slug="slug_inexistente")

    assert exc_info.value.status_code == 404
    assert "Badge" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_badge_progress_zero() -> None:
    """Badge existe mas usuário não tem progresso — percentage é 0.0."""
    user_id = uuid.uuid4()
    badge = _make_badge(slug="bookworm")

    db = AsyncMock()

    # Primeira chamada: busca o badge pelo slug
    res_badge = MagicMock()
    res_badge.scalar_one_or_none.return_value = badge

    # Segunda chamada: _compute_badge_progress (bookworm → count de reviews)
    res_progress = MagicMock()
    res_progress.scalar_one.return_value = 0

    db.execute = AsyncMock(side_effect=[res_badge, res_progress])

    result = await get_badge_progress(db, user_id=user_id, slug="bookworm")

    assert result["slug"] == "bookworm"
    assert result["current"] == 0
    assert result["percentage"] == 0.0


@pytest.mark.asyncio
async def test_get_badge_progress_partial() -> None:
    """Progresso parcial — percentage calculada corretamente."""
    user_id = uuid.uuid4()
    # bookworm target=5; usuário tem 2 reviews → 40%
    badge = _make_badge(slug="bookworm")

    db = AsyncMock()

    res_badge = MagicMock()
    res_badge.scalar_one_or_none.return_value = badge

    res_progress = MagicMock()
    res_progress.scalar_one.return_value = 2

    db.execute = AsyncMock(side_effect=[res_badge, res_progress])

    result = await get_badge_progress(db, user_id=user_id, slug="bookworm")

    assert result["current"] == 2
    assert result["target"] == 5
    assert result["percentage"] == 40.0


# ── marathon target ─────────────────────────────────────────────────────────────


def test_marathon_target_is_120() -> None:
    """_BADGE_TARGETS['marathon'] deve ser 120, não 1."""
    from app.services.badge import _BADGE_TARGETS

    assert _BADGE_TARGETS["marathon"] == 120


@pytest.mark.asyncio
async def test_get_badge_progress_marathon_target() -> None:
    """Progresso do marathon retorna target=120."""
    user_id = uuid.uuid4()
    badge = _make_badge(slug="marathon")

    db = AsyncMock()

    res_badge = MagicMock()
    res_badge.scalar_one_or_none.return_value = badge

    # marathon progress usa ReadingSession max duration
    res_progress = MagicMock()
    res_progress.scalar_one.return_value = 60  # 60 min de máximo

    db.execute = AsyncMock(side_effect=[res_badge, res_progress])

    result = await get_badge_progress(db, user_id=user_id, slug="marathon")

    assert result["target"] == 120
    assert result["current"] == 60
    assert result["percentage"] == 50.0


@pytest.mark.asyncio
async def test_get_badge_progress_marathon_119_min_not_full() -> None:
    """119 minutos não alcança 100% no badge marathon."""
    user_id = uuid.uuid4()
    badge = _make_badge(slug="marathon")

    db = AsyncMock()

    res_badge = MagicMock()
    res_badge.scalar_one_or_none.return_value = badge

    res_progress = MagicMock()
    res_progress.scalar_one.return_value = 119

    db.execute = AsyncMock(side_effect=[res_badge, res_progress])

    result = await get_badge_progress(db, user_id=user_id, slug="marathon")

    assert result["percentage"] < 100.0
