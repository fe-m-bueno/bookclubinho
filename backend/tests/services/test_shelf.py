"""Testes unitários para app.services.shelf."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import RedisError

from app.services.shelf import ShelfError, _make_serializable, get_group_shelf, get_public_shelf

# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_group(**overrides: object) -> MagicMock:
    g = MagicMock()
    g.id = overrides.get("id", uuid.uuid4())
    g.name = overrides.get("name", "Clube do Livro")
    g.photo_url = overrides.get("photo_url")
    return g


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.book_title = overrides.get("book_title", "Dom Casmurro")
    r.book_author = overrides.get("book_author", "Machado de Assis")
    r.book_cover_url = overrides.get("book_cover_url")
    r.book_page_count = overrides.get("book_page_count", 256)
    r.book_genres = overrides.get("book_genres", ["ficção"])
    r.started_at = overrides.get("started_at", datetime(2026, 1, 1, tzinfo=UTC))
    r.finished_at = overrides.get("finished_at", datetime(2026, 2, 1, tzinfo=UTC))
    return r


# ── get_group_shelf ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_group_shelf_not_found() -> None:
    """Grupo inexistente deve levantar ShelfError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ShelfError) as exc_info:
        await get_group_shelf(db, group_id=uuid.uuid4())

    assert exc_info.value.status_code == 404
    assert "Grupo" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_group_shelf_success() -> None:
    """Grupo existente retorna dict com chave 'books' e grava cache."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)

    db = AsyncMock()

    # Primeira chamada: busca o grupo
    res_group = MagicMock()
    res_group.scalar_one_or_none.return_value = group

    # Segunda chamada: busca rounds finalizados (lista vazia simplifica o teste)
    res_rounds = MagicMock()
    res_rounds.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[res_group, res_rounds])

    with patch("app.services.shelf._write_shelf_cache", new_callable=AsyncMock) as mock_cache:
        result = await get_group_shelf(db, group_id=group_id)

    assert "books" in result
    assert result["group_name"] == group.name
    mock_cache.assert_called_once()


# ── get_public_shelf ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_public_shelf_cache_hit() -> None:
    """Redis contém a chave — retorna dict parseado sem acessar o banco."""
    group_id = uuid.uuid4()
    cached_payload = b'{"group_name": "Clube", "books": []}'

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=cached_payload)

    with patch("app.services.shelf.get_redis", return_value=mock_redis):
        result = await get_public_shelf(group_id)

    assert result == {"group_name": "Clube", "books": []}
    mock_redis.get.assert_called_once_with(f"shelf:public:{group_id}")


@pytest.mark.asyncio
async def test_get_public_shelf_cache_miss() -> None:
    """Redis não tem a chave — retorna None."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with patch("app.services.shelf.get_redis", return_value=mock_redis):
        result = await get_public_shelf(group_id)

    assert result is None


@pytest.mark.asyncio
async def test_get_public_shelf_redis_error() -> None:
    """RedisError durante leitura — retorna None sem propagar exceção."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=RedisError("conexão recusada"))

    with patch("app.services.shelf.get_redis", return_value=mock_redis):
        result = await get_public_shelf(group_id)

    assert result is None


# ── _make_serializable ─────────────────────────────────────────────────────────


def test_make_serializable_datetime() -> None:
    """Objeto datetime é convertido para string ISO 8601."""
    dt = datetime(2026, 3, 20, 12, 0, 0, tzinfo=UTC)
    result = _make_serializable(dt)
    assert isinstance(result, str)
    assert "2026-03-20" in result


def test_make_serializable_uuid() -> None:
    """UUID é convertido para string."""
    uid = uuid.UUID("12345678-1234-5678-1234-567812345678")
    result = _make_serializable(uid)
    assert result == "12345678-1234-5678-1234-567812345678"


def test_make_serializable_nested() -> None:
    """Dicts e listas são convertidos recursivamente."""
    uid = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
    dt = datetime(2026, 1, 1, tzinfo=UTC)
    data = {
        "id": uid,
        "items": [dt, {"nested_id": uid}],
        "plain": 42,
    }

    result = _make_serializable(data)

    assert result["id"] == str(uid)
    assert isinstance(result["items"][0], str)
    assert result["items"][1]["nested_id"] == str(uid)
    assert result["plain"] == 42
