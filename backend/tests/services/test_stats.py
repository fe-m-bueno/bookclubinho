"""Testes unitários para app.services.stats."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.stats import (
    StatsError,
    get_group_stats,
    get_round_stats,
    get_user_stats,
    invalidate_group_stats,
)

# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid.uuid4())
    u.username = overrides.get("username", "leitor")
    u.display_name = overrides.get("display_name", "Leitor Teste")
    u.avatar_url = overrides.get("avatar_url")
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


def _make_emotional_row(
    *,
    total_reviews: int = 0,
    cried_count: int = 0,
    loved_it_count: int = 0,
    felt_aroused_count: int = 0,
    found_heavy_count: int = 0,
    wants_more_count: int = 0,
) -> MagicMock:
    """Cria um mock de row retornado pelo emotional stats query."""
    row = MagicMock()
    row.total_reviews = total_reviews
    row.cried_count = cried_count
    row.loved_it_count = loved_it_count
    row.felt_aroused_count = felt_aroused_count
    row.found_heavy_count = found_heavy_count
    row.wants_more_count = wants_more_count
    return row


def _make_rating_rows(raw_ratings: list[int]) -> list[MagicMock]:
    """Convert a flat list of star values to grouped (star_rating, cnt) rows."""
    from collections import Counter

    counts = Counter(raw_ratings)
    rows = []
    for star, cnt in sorted(counts.items()):
        row = MagicMock()
        row.star_rating = star
        row.cnt = cnt
        rows.append(row)
    return rows


def _make_grouped_rows(mapping: dict, key_attr: str, **value_attrs: str) -> list[MagicMock]:
    """Rows de um `GROUP BY key_attr`, a partir de {key: valor} ou {key: (v1, v2)}.

    `value_attrs` mapeia posição → nome do atributo, na ordem da tupla.
    """
    names = list(value_attrs.values())
    rows = []
    for key, value in mapping.items():
        row = MagicMock()
        setattr(row, key_attr, key)
        values = value if isinstance(value, tuple) else (value,)
        for name, val in zip(names, values, strict=True):
            setattr(row, name, val)
        rows.append(row)
    return rows


def _make_group_stats_db_mocks(
    *,
    rounds: list[MagicMock] | None = None,
    avg_rating: float | None = None,
    members: list[tuple[MagicMock, MagicMock]] | None = None,
    reviews_by_user: dict | None = None,
    times_by_user: dict | None = None,
    badges_by_user: dict | None = None,
    raw_ratings: list[int] | None = None,
    emotional_row: MagicMock | None = None,
) -> tuple[AsyncMock, list[MagicMock]]:
    """Builds a sequence of db.execute side_effect mocks for _compute_group_stats.

    The call order is:
        1. finished_rounds     → scalars().all()
        2. avg_rating          → scalar_one_or_none()
        3. members             → all()
        4. reviews_by_user     → all()   (GROUP BY user_id)
        5. times_by_user       → all()   (GROUP BY user_id — só se houver rodada finalizada)
        6. badges_by_user      → all()   (GROUP BY user_id — só se houver membro)
        7. rating_distribution → all()   (GROUP BY star_rating)
        8. emotional_stats     → one()

    As agregações por usuário são fixas em número: nada depende da quantidade de
    membros. É o que o teste de contagem de queries protege.

    Returns the db AsyncMock and the list of result mocks in call order.
    """
    rounds = rounds or []
    members = members or []
    raw_ratings = raw_ratings if raw_ratings is not None else []
    if emotional_row is None:
        emotional_row = _make_emotional_row()

    res_rounds = MagicMock()
    res_rounds.scalars.return_value.all.return_value = rounds

    res_avg = MagicMock()
    res_avg.scalar_one_or_none.return_value = avg_rating

    res_members = MagicMock()
    res_members.all.return_value = members

    res_reviews = MagicMock()
    res_reviews.all.return_value = _make_grouped_rows(
        reviews_by_user or {}, "user_id", v0="reviews_count", v1="avg_rating"
    )

    res_times = MagicMock()
    res_times.all.return_value = _make_grouped_rows(times_by_user or {}, "user_id", v0="minutes")

    res_badges = MagicMock()
    res_badges.all.return_value = _make_grouped_rows(badges_by_user or {}, "user_id", v0="badges_count")

    res_ratings = MagicMock()
    res_ratings.all.return_value = _make_rating_rows(raw_ratings)

    res_emotional = MagicMock()
    res_emotional.one.return_value = emotional_row

    side_effects = [res_rounds, res_avg, res_members, res_reviews]
    if rounds:
        side_effects.append(res_times)
    if members:
        side_effects.append(res_badges)
    side_effects += [res_ratings, res_emotional]

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=side_effects)

    return db, side_effects


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

    db, _ = _make_group_stats_db_mocks()

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

    db, _ = _make_group_stats_db_mocks()

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    assert result["member_leaderboard"] == []


# ── member_leaderboard ─────────────────────────────────────────────────────────


def _no_cache_redis() -> AsyncMock:
    """Redis mock com cache sempre vazio."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock()
    return redis


def _make_members(count: int) -> list[tuple[MagicMock, MagicMock]]:
    """`count` pares (GroupMember, User) como o join do leaderboard retorna."""
    return [(MagicMock(), _make_user(username=f"leitor{i}", display_name=f"Leitor {i}")) for i in range(count)]


@pytest.mark.asyncio
async def test_leaderboard_query_count_is_independent_of_member_count() -> None:
    """A contagem de queries de _compute_group_stats não pode crescer com os membros.

    O bug era N+1: três queries por membro dentro do loop (24 round-trips no teto
    de 8 membros). Este teste é o que impede a regressão voltar.
    """
    rounds = [_make_round()]

    async def _count_queries(member_count: int) -> int:
        members = _make_members(member_count)
        db, _ = _make_group_stats_db_mocks(
            rounds=rounds,
            members=members,
            reviews_by_user={user.id: (1, 4.0) for _m, user in members},
            times_by_user={user.id: 30 for _m, user in members},
            badges_by_user={user.id: 2 for _m, user in members},
        )
        with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
            await get_group_stats(db, group_id=uuid.uuid4())
        return db.execute.await_count

    one_member = await _count_queries(1)
    eight_members = await _count_queries(8)

    assert one_member == eight_members, "a contagem de queries deve ser constante no número de membros"
    assert eight_members == 8, "1 rodadas + 1 avg + 1 membros + 3 agregações por usuário + 1 ratings + 1 emocional"


@pytest.mark.asyncio
async def test_leaderboard_no_execute_inside_loop() -> None:
    """Oito membros com dados completos ainda cabem em 8 queries."""
    members = _make_members(8)
    db, _ = _make_group_stats_db_mocks(
        rounds=[_make_round(), _make_round()],
        members=members,
        reviews_by_user={user.id: (i, 5.0) for i, (_m, user) in enumerate(members)},
        times_by_user={user.id: i * 10 for i, (_m, user) in enumerate(members)},
        badges_by_user={user.id: i for i, (_m, user) in enumerate(members)},
    )

    with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
        result = await get_group_stats(db, group_id=uuid.uuid4())

    assert len(result["member_leaderboard"]) == 8
    assert db.execute.await_count == 8


@pytest.mark.asyncio
async def test_leaderboard_maps_aggregates_to_the_right_member() -> None:
    """Cada linha do leaderboard recebe os números do próprio usuário."""
    members = _make_members(3)
    alice, bob, carol = (user for _m, user in members)

    db, _ = _make_group_stats_db_mocks(
        rounds=[_make_round()],
        members=members,
        reviews_by_user={alice.id: (3, 4.5), carol.id: (1, 2.0)},
        times_by_user={alice.id: 120, carol.id: 45},
        badges_by_user={alice.id: 7, bob.id: 1},
    )

    with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
        result = await get_group_stats(db, group_id=uuid.uuid4())

    by_user = {row["user_id"]: row for row in result["member_leaderboard"]}

    assert by_user[str(alice.id)]["books_finished"] == 3
    assert by_user[str(alice.id)]["reviews_count"] == 3
    assert by_user[str(alice.id)]["avg_rating"] == 4.5
    assert by_user[str(alice.id)]["reading_time_minutes"] == 120
    assert by_user[str(alice.id)]["badges_count"] == 7

    # Bob não tem review nem sessão — zeros, não KeyError
    assert by_user[str(bob.id)]["books_finished"] == 0
    assert by_user[str(bob.id)]["avg_rating"] is None
    assert by_user[str(bob.id)]["reading_time_minutes"] == 0
    assert by_user[str(bob.id)]["badges_count"] == 1

    assert by_user[str(carol.id)]["reading_time_minutes"] == 45
    assert by_user[str(carol.id)]["badges_count"] == 0


@pytest.mark.asyncio
async def test_leaderboard_sorted_by_books_finished_desc() -> None:
    """O ordenamento do leaderboard segue books_finished decrescente."""
    members = _make_members(4)
    users = [user for _m, user in members]

    db, _ = _make_group_stats_db_mocks(
        rounds=[_make_round()],
        members=members,
        reviews_by_user={users[0].id: (1, 3.0), users[2].id: (5, 4.0), users[3].id: (2, 5.0)},
    )

    with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
        result = await get_group_stats(db, group_id=uuid.uuid4())

    assert [row["books_finished"] for row in result["member_leaderboard"]] == [5, 2, 1, 0]


@pytest.mark.asyncio
async def test_total_reading_time_derived_from_member_sums() -> None:
    """total_reading_time_minutes é a soma das agregações por membro — sem query própria."""
    members = _make_members(3)
    users = [user for _m, user in members]

    db, _ = _make_group_stats_db_mocks(
        rounds=[_make_round()],
        members=members,
        times_by_user={users[0].id: 100, users[1].id: 25, users[2].id: 5},
    )

    with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
        result = await get_group_stats(db, group_id=uuid.uuid4())

    assert result["total_reading_time_minutes"] == 130
    assert sum(row["reading_time_minutes"] for row in result["member_leaderboard"]) == 130


@pytest.mark.asyncio
async def test_no_finished_round_skips_reading_session_aggregation() -> None:
    """Sem rodada finalizada não se monta um `IN ()` — a query de sessões nem roda."""
    members = _make_members(2)
    db, _ = _make_group_stats_db_mocks(members=members, reviews_by_user={members[0][1].id: (1, 4.0)})

    with patch("app.services.stats.get_redis", return_value=_no_cache_redis()):
        result = await get_group_stats(db, group_id=uuid.uuid4())

    assert db.execute.await_count == 7, "a agregação de sessões é dispensada quando não há rodada finalizada"
    assert result["total_reading_time_minutes"] == 0
    # Reviews de rodadas ainda não finalizadas continuam contando no leaderboard
    assert result["member_leaderboard"][0]["books_finished"] == 1


# ── rating_distribution ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rating_distribution_all_stars_present_even_when_zero() -> None:
    """rating_distribution deve conter entradas para as estrelas 1-5,
    inclusive quando não há reviews com aquela nota."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    # Reviews: 2x estrela 5, 1x estrela 3 — estrelas 1, 2, 4 ficam zeradas
    db, _ = _make_group_stats_db_mocks(raw_ratings=[5, 5, 3])

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    dist = result["rating_distribution"]
    stars = [entry["stars"] for entry in dist]

    assert stars == [1, 2, 3, 4, 5], "Deve haver uma entrada para cada estrela de 1 a 5"

    counts = {entry["stars"]: entry["count"] for entry in dist}
    assert counts[5] == 2
    assert counts[3] == 1
    assert counts[1] == 0
    assert counts[2] == 0
    assert counts[4] == 0


@pytest.mark.asyncio
async def test_rating_distribution_no_reviews() -> None:
    """Sem reviews, todas as estrelas devem ter count=0."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    db, _ = _make_group_stats_db_mocks(raw_ratings=[])

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    dist = result["rating_distribution"]
    assert len(dist) == 5
    assert all(entry["count"] == 0 for entry in dist)


@pytest.mark.asyncio
async def test_rating_distribution_counts_are_non_negative() -> None:
    """Todos os counts devem ser inteiros não-negativos."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    db, _ = _make_group_stats_db_mocks(raw_ratings=[1, 2, 2, 3, 4, 4, 4, 5])

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    dist = result["rating_distribution"]
    for entry in dist:
        assert isinstance(entry["count"], int)
        assert entry["count"] >= 0


# ── emotional_stats ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_emotional_stats_all_fields_present() -> None:
    """emotional_stats deve conter todos os campos esperados."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    emotional_row = _make_emotional_row(
        total_reviews=10,
        cried_count=3,
        loved_it_count=7,
        felt_aroused_count=2,
        found_heavy_count=5,
        wants_more_count=8,
    )
    db, _ = _make_group_stats_db_mocks(emotional_row=emotional_row)

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    es = result["emotional_stats"]
    assert es["total_reviews"] == 10
    assert es["cried_count"] == 3
    assert es["loved_it_count"] == 7
    assert es["felt_aroused_count"] == 2
    assert es["found_heavy_count"] == 5
    assert es["wants_more_count"] == 8


@pytest.mark.asyncio
async def test_emotional_stats_fields_non_negative() -> None:
    """Todos os campos de emotional_stats devem ser inteiros não-negativos."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    db, _ = _make_group_stats_db_mocks(
        emotional_row=_make_emotional_row(
            total_reviews=5,
            cried_count=0,
            loved_it_count=5,
            felt_aroused_count=1,
            found_heavy_count=2,
            wants_more_count=4,
        )
    )

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    es = result["emotional_stats"]
    expected_keys = {
        "total_reviews",
        "cried_count",
        "loved_it_count",
        "felt_aroused_count",
        "found_heavy_count",
        "wants_more_count",
    }
    assert expected_keys == set(es.keys())
    for key, value in es.items():
        assert isinstance(value, int), f"{key} deve ser int"
        assert value >= 0, f"{key} deve ser não-negativo"


@pytest.mark.asyncio
async def test_emotional_stats_no_reviews_defaults_to_zero() -> None:
    """Sem reviews, todos os campos emocionais devem ser 0."""
    group_id = uuid.uuid4()

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    # Simula retorno de NULL do banco (como quando não há reviews)
    null_row = _make_emotional_row(
        total_reviews=0,
        cried_count=0,
        loved_it_count=0,
        felt_aroused_count=0,
        found_heavy_count=0,
        wants_more_count=0,
    )
    # Sobrescreve com None para testar o `or 0` defensivo
    null_row.cried_count = None
    null_row.loved_it_count = None
    null_row.felt_aroused_count = None
    null_row.found_heavy_count = None
    null_row.wants_more_count = None

    db, _ = _make_group_stats_db_mocks(emotional_row=null_row)

    with patch("app.services.stats.get_redis", return_value=mock_redis):
        result = await get_group_stats(db, group_id=group_id)

    es = result["emotional_stats"]
    assert es["cried_count"] == 0
    assert es["loved_it_count"] == 0
    assert es["felt_aroused_count"] == 0
    assert es["found_heavy_count"] == 0
    assert es["wants_more_count"] == 0


# ── GroupStatsResponse schema validation ──────────────────────────────────────


def test_group_stats_response_schema_validates_new_fields() -> None:
    """GroupStatsResponse deve aceitar rating_distribution e emotional_stats."""
    from app.schemas.stats import EmotionalStats, GroupStatsResponse, RatingDistribution

    payload = {
        "total_books_read": 3,
        "total_pages_read": 900,
        "average_rating": 4.1,
        "total_reading_time_minutes": 600,
        "books_per_genre": [{"genre": "ficção", "count": 2}],
        "member_leaderboard": [],
        "rating_distribution": [
            {"stars": 1, "count": 0},
            {"stars": 2, "count": 0},
            {"stars": 3, "count": 1},
            {"stars": 4, "count": 1},
            {"stars": 5, "count": 1},
        ],
        "emotional_stats": {
            "total_reviews": 3,
            "cried_count": 1,
            "loved_it_count": 2,
            "felt_aroused_count": 0,
            "found_heavy_count": 1,
            "wants_more_count": 3,
        },
    }

    response = GroupStatsResponse(**payload)

    assert len(response.rating_distribution) == 5
    assert all(isinstance(entry, RatingDistribution) for entry in response.rating_distribution)
    assert isinstance(response.emotional_stats, EmotionalStats)
    assert response.emotional_stats.total_reviews == 3


def test_rating_distribution_schema() -> None:
    """RatingDistribution deve validar stars e count como inteiros."""
    from app.schemas.stats import RatingDistribution

    entry = RatingDistribution(stars=4, count=7)
    assert entry.stars == 4
    assert entry.count == 7


def test_emotional_stats_schema() -> None:
    """EmotionalStats deve validar todos os campos como inteiros."""
    from app.schemas.stats import EmotionalStats

    es = EmotionalStats(
        total_reviews=10,
        cried_count=3,
        loved_it_count=7,
        felt_aroused_count=2,
        found_heavy_count=5,
        wants_more_count=8,
    )
    assert es.total_reviews == 10
    assert es.wants_more_count == 8


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
