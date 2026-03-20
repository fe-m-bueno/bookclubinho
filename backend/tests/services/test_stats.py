"""Testes unitários para app.services.stats."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from redis.exceptions import RedisError

from app.services.stats import StatsError, get_group_stats, get_round_stats, get_user_stats, invalidate_group_stats


# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid.uuid4())
    u.username = overrides.get("username", "leitor")
    u.display_name = overrides.get("display_name", "Leitor Teste")
    u.avatar_url = overrides.get("avatar_url", None)
    u.streak_current = overrides.get("streak_current", 0)
    u.streak_longest = overrides.get("streak_longest", 0)
    return u


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.book_title = overrides.get("book_title", "Grande Sertão: Veredas")
    r.book_author = overrides.get("book_author", "Guimarães Rosa")
    r.book_page_count = overrides.get("book_page_count", 600)
    r.book_genres = overrides.get("book_genres", ["ficção"])
    return r


# ── invalidate_group_stats ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invalidate_group_stats() -> None:
    """Deve chamar redis.delete com a chave correta."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.delete = AsyncMock()

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        await invalidate_group_stats(group_id)

    mock_redis.delete.assert_called_once_with(f"stats:group:{group_id}")


# ── get_group_stats ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_group_stats_cache_hit() -> None:
    """Cache presente no Redis — retorna dados sem consultar o banco."""
    group_id = uuid.uuid4()
    payload = b'{"total_books_read": 5, "member_leaderboard": []}'

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=payload)

    db = AsyncMock()

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    assert result["total_books_read"] == 5
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_get_group_stats_cache_miss_group_not_found() -> None:
    """Cache ausente e nenhuma rodada finalizada — retorna dict com zeros."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    db = AsyncMock()

    # Execute calls dentro de _compute_group_stats:
    # 1. finished_rounds  2. avg_rating  3. total_time  4. members
    res_rounds = MagicMock()
    res_rounds.scalars.return_value.all.return_value = []

    res_avg = MagicMock()
    res_avg.scalar_one_or_none.return_value = None

    res_time = MagicMock()
    res_time.scalar_one.return_value = 0

    res_members = MagicMock()
    res_members.all.return_value = []

    db.execute = AsyncMock(side_effect=[res_rounds, res_avg, res_time, res_members])

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    assert result["total_books_read"] == 0
    assert result["total_pages_read"] == 0
    assert result["average_rating"] is None
    assert result["member_leaderboard"] == []


@pytest.mark.asyncio
async def test_get_group_stats_cache_miss_no_member() -> None:
    """Cache ausente e sem membros — retorna leaderboard vazio."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    db = AsyncMock()

    res_rounds = MagicMock()
    res_rounds.scalars.return_value.all.return_value = []

    res_avg = MagicMock()
    res_avg.scalar_one_or_none.return_value = None

    res_time = MagicMock()
    res_time.scalar_one.return_value = 0

    res_members = MagicMock()
    res_members.all.return_value = []

    db.execute = AsyncMock(side_effect=[res_rounds, res_avg, res_time, res_members])

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    assert result["member_leaderboard"] == []


# ── get_round_stats ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_round_stats_not_found() -> None:
    """Rodada não encontrada — levanta StatsError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(StatsError) as exc_info:
        await get_round_stats(db, group_id=uuid.uuid4(), round_id=uuid.uuid4())

    assert exc_info.value.status_code == 404
    assert "Rodada" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_round_stats_success() -> None:
    """Rodada encontrada — retorna dict com campos esperados."""
    group_id = uuid.uuid4()
    round_id = uuid.uuid4()
    round_ = _make_round(id=round_id, group_id=group_id)

    db = AsyncMock()

    res_round = MagicMock()
    res_round.scalar_one_or_none.return_value = round_

    # review_stats (one() retorna row com atributos)
    review_row = MagicMock()
    review_row.reviews_count = 3
    review_row.avg_rating = 4.2
    res_reviews = MagicMock()
    res_reviews.one.return_value = review_row

    res_time = MagicMock()
    res_time.scalar_one.return_value = 120

    res_members = MagicMock()
    res_members.scalar_one.return_value = 4

    db.execute = AsyncMock(side_effect=[res_round, res_reviews, res_time, res_members])

    result = await get_round_stats(db, group_id=group_id, round_id=round_id)

    assert result["round_id"] == str(round_id)
    assert result["reviews_count"] == 3
    assert result["total_reading_time_minutes"] == 120
    assert result["members_total"] == 4


# ── get_user_stats ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_user_stats_no_rounds() -> None:
    """Usuário sem rodadas — retorna zeros e listas vazias."""
    user_id = uuid.uuid4()
    user = _make_user(id=user_id, streak_longest=0)

    db = AsyncMock()

    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = user

    res_books = MagicMock()
    res_books.scalar_one.return_value = 0

    res_time = MagicMock()
    res_time.scalar_one.return_value = 0

    res_genres = MagicMock()
    res_genres.all.return_value = []

    res_badges = MagicMock()
    res_badges.scalar_one.return_value = 0

    db.execute = AsyncMock(side_effect=[res_user, res_books, res_time, res_genres, res_badges])

    result = await get_user_stats(db, user_id=user_id)

    assert result["total_books"] == 0
    assert result["total_reading_time_minutes"] == 0
    assert result["genres_read"] == []
    assert result["badges_count"] == 0


@pytest.mark.asyncio
async def test_get_user_stats_user_not_found() -> None:
    """Usuário inexistente — levanta StatsError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(StatsError) as exc_info:
        await get_user_stats(db, user_id=uuid.uuid4())

    assert exc_info.value.status_code == 404
    assert "Usuário" in str(exc_info.value)
