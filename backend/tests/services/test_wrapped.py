"""Testes unitários para app.services.wrapped."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.wrapped import (
    WrappedError,
    _compute_wrapped_data,
    generate_wrapped,
    get_wrapped,
)

# ── Mock factories ──────────────────────────────────────────────────────────────


def _make_user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", uuid.uuid4())
    u.username = overrides.get("username", "leitor")
    u.display_name = overrides.get("display_name", "Leitor Teste")
    u.avatar_url = overrides.get("avatar_url")
    u.streak_current = overrides.get("streak_current", 0)
    u.streak_longest = overrides.get("streak_longest", 0)
    return u


def _make_group(**overrides: object) -> MagicMock:
    g = MagicMock()
    g.id = overrides.get("id", uuid.uuid4())
    g.name = overrides.get("name", "Clube dos Leitores")
    g.photo_url = overrides.get("photo_url")
    return g


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.book_title = overrides.get("book_title", "Grande Sertão: Veredas")
    r.book_author = overrides.get("book_author", "Guimarães Rosa")
    r.book_cover_url = overrides.get("book_cover_url")
    r.book_page_count = overrides.get("book_page_count", 600)
    r.book_genres = overrides.get("book_genres", ["ficção"])
    r.finished_at = overrides.get("finished_at", datetime(2025, 12, 1, tzinfo=UTC))
    return r


def _make_wrapped_report(**overrides: object) -> MagicMock:
    report = MagicMock()
    report.id = overrides.get("id", uuid.uuid4())
    report.group_id = overrides.get("group_id", uuid.uuid4())
    report.year = overrides.get("year", 2025)
    report.data = overrides.get("data", {})
    report.generated_by = overrides.get("generated_by", uuid.uuid4())
    report.generated_at = overrides.get("generated_at", datetime(2025, 12, 31, tzinfo=UTC))
    return report


# ── get_wrapped ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_not_found_raises_404() -> None:
    """Wrapped não encontrado deve levantar WrappedError 404."""
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(WrappedError) as exc_info:
        await get_wrapped(db, group_id=uuid.uuid4(), year=2025)

    assert exc_info.value.status_code == 404
    assert "2025" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_success_returns_dict() -> None:
    """Wrapped encontrado deve retornar dict com campos corretos."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    report = _make_wrapped_report(
        group_id=group_id,
        year=2025,
        generated_by=user_id,
        data={"year": 2025, "total_books_read": 3},
    )

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = report
    db.execute = AsyncMock(return_value=res)

    result = await get_wrapped(db, group_id=group_id, year=2025)

    assert result["group_id"] == str(group_id)
    assert result["year"] == 2025
    assert result["data"]["total_books_read"] == 3
    assert result["generated_by"] == str(user_id)


# ── generate_wrapped ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_creates_row() -> None:
    """generate_wrapped deve executar upsert e retornar o dict correto."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    report = _make_wrapped_report(group_id=group_id, year=2025, generated_by=user_id)

    db = AsyncMock()
    db.commit = AsyncMock()

    fake_data: dict = {
        "year": 2025,
        "group_name": "Clube",
        "group_photo_url": None,
        "total_books_read": 2,
        "total_pages": 500,
        "total_reading_hours": 8.0,
        "genre_breakdown": [],
        "highest_rated_book": None,
        "most_active_member": None,
        "longest_streak_member": None,
        "funniest_oneliner": None,
        "most_emotional_book": None,
        "member_superlatives": [],
        "emotional_stats": {
            "total_reviews": 0,
            "cried_count": 0,
            "loved_it_count": 0,
            "felt_aroused_count": 0,
            "found_heavy_count": 0,
            "wants_more_count": 0,
        },
        "member_avatars": [],
    }

    # execute is called once: pg_insert with .returning() — scalar_one() reads from result
    res_insert = MagicMock()
    res_insert.scalar_one.return_value = report
    db.execute = AsyncMock(return_value=res_insert)

    with patch("app.services.wrapped._compute_wrapped_data", AsyncMock(return_value=fake_data)):
        result = await generate_wrapped(db, group_id=group_id, year=2025, user_id=user_id)

    db.commit.assert_called_once()
    assert result["group_id"] == str(group_id)
    assert result["year"] == 2025


@pytest.mark.asyncio
async def test_generate_overwrites_existing() -> None:
    """generate_wrapped deve sobrescrever um report existente via upsert."""
    group_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing_report = _make_wrapped_report(
        group_id=group_id, year=2025, generated_by=user_id, data={"year": 2025, "total_books_read": 5}
    )

    db = AsyncMock()
    db.commit = AsyncMock()

    fake_data: dict = {
        "year": 2025,
        "group_name": "Clube",
        "group_photo_url": None,
        "total_books_read": 7,
        "total_pages": 700,
        "total_reading_hours": 12.0,
        "genre_breakdown": [],
        "highest_rated_book": None,
        "most_active_member": None,
        "longest_streak_member": None,
        "funniest_oneliner": None,
        "most_emotional_book": None,
        "member_superlatives": [],
        "emotional_stats": {
            "total_reviews": 0,
            "cried_count": 0,
            "loved_it_count": 0,
            "felt_aroused_count": 0,
            "found_heavy_count": 0,
            "wants_more_count": 0,
        },
        "member_avatars": [],
    }
    existing_report.data = fake_data

    res_insert = MagicMock()
    res_insert.scalar_one.return_value = existing_report
    db.execute = AsyncMock(return_value=res_insert)

    with patch("app.services.wrapped._compute_wrapped_data", AsyncMock(return_value=fake_data)):
        result = await generate_wrapped(db, group_id=group_id, year=2025, user_id=user_id)

    assert result["data"]["total_books_read"] == 7
    db.commit.assert_called_once()


# ── _compute_wrapped_data ──────────────────────────────────────────────────────


def _build_compute_db(
    *,
    group: MagicMock | None = None,
    rounds: list[MagicMock] | None = None,
    total_minutes: int = 0,
    avg_rating_row: MagicMock | None = None,
    active_user: MagicMock | None = None,
    streak_user: MagicMock | None = None,
    oneliner_row: tuple[MagicMock, MagicMock] | None = None,
    emotional_row: MagicMock | None = None,
    es_row: MagicMock | None = None,
    members: list[MagicMock] | None = None,
    superlative_rows: list[MagicMock | None] | None = None,
) -> AsyncMock:
    """Build a db mock for _compute_wrapped_data.

    Actual call order when round_ids is non-empty:
      1.  group select              → scalar_one_or_none
      2.  finished_rounds select    → scalars().all()
      3.  total_minutes             → scalar_one         (only if round_ids)
      4.  avg_rating (highest)      → one_or_none        (only if round_ids)
      5.  active member (JOIN User) → scalar_one_or_none (only if round_ids)
      6.  streak member select      → scalar_one_or_none (always)
      7.  funniest oneliner (2-tuple) → one_or_none       (only if round_ids)
      8.  most emotional book       → one_or_none        (only if round_ids)
      9.  member_avatars            → scalars().all()    (always)
     10.  speed reader              → one_or_none        (only if round_ids and members)
     11.  critic reviews            → one_or_none        (only if round_ids and members)
     12.  quotes master             → one_or_none        (only if round_ids and members)
     13.  chorão                    → one_or_none        (only if round_ids and members)
     14.  emotional stats           → one                (only if round_ids)
    """
    rounds = rounds or []
    members = members or []
    has_rounds = len(rounds) > 0
    has_members = len(members) > 0

    def _scalar_or_none(value: object) -> MagicMock:
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        return r

    def _scalar_one(value: object) -> MagicMock:
        r = MagicMock()
        r.scalar_one.return_value = value
        return r

    def _one_or_none(value: object) -> MagicMock:
        r = MagicMock()
        r.one_or_none.return_value = value
        return r

    def _one(value: object) -> MagicMock:
        r = MagicMock()
        r.one.return_value = value
        return r

    def _scalars_all(values: list) -> MagicMock:
        r = MagicMock()
        r.scalars.return_value.all.return_value = values
        return r

    if es_row is None:
        es_row = MagicMock()
        es_row.total_reviews = 0
        es_row.cried_count = 0
        es_row.loved_it_count = 0
        es_row.felt_aroused_count = 0
        es_row.found_heavy_count = 0
        es_row.wants_more_count = 0

    sup_rows = superlative_rows or [None, None, None, None]

    side_effects: list[MagicMock] = [
        _scalar_or_none(group),  # 1. group
        _scalars_all(rounds),  # 2. finished_rounds
    ]

    if has_rounds:
        side_effects.append(_scalar_one(total_minutes))  # 3. total_minutes
        side_effects.append(_one_or_none(avg_rating_row))  # 4. highest rated
        side_effects.append(_scalar_or_none(active_user))  # 5. most active (JOIN User)

    side_effects.append(_scalar_or_none(streak_user))  # 6. streak member

    if has_rounds:
        side_effects.append(_one_or_none(oneliner_row))  # 7. funniest oneliner (2-tuple)
        side_effects.append(_one_or_none(emotional_row))  # 8. most emotional book

    side_effects.append(_scalars_all(members))  # 9. member_avatars

    if has_rounds and has_members:
        side_effects.append(_one_or_none(sup_rows[0]))  # 10. speed reader
        side_effects.append(_one_or_none(sup_rows[1]))  # 11. critic
        side_effects.append(_one_or_none(sup_rows[2]))  # 12. quotes master
        side_effects.append(_one_or_none(sup_rows[3]))  # 13. chorão

    if has_rounds:
        side_effects.append(_one(es_row))  # 14. emotional stats

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=side_effects)
    return db


@pytest.mark.asyncio
async def test_compute_wrapped_no_rounds() -> None:
    """Sem rounds no ano, retorna zeros e nulos."""
    group = _make_group()
    db = _build_compute_db(group=group, rounds=[])

    result = await _compute_wrapped_data(db, group_id=group.id, year=2025)

    assert result["total_books_read"] == 0
    assert result["total_pages"] == 0
    assert result["total_reading_hours"] == 0.0
    assert result["genre_breakdown"] == []
    assert result["highest_rated_book"] is None
    assert result["most_active_member"] is None
    assert result["member_superlatives"] == []
    assert result["emotional_stats"]["total_reviews"] == 0


@pytest.mark.asyncio
async def test_highest_rated_book_correct() -> None:
    """O livro com maior avg_rating deve ser retornado corretamente."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)

    round_id = uuid.uuid4()
    round_ = _make_round(
        id=round_id,
        group_id=group_id,
        book_title="Dom Casmurro",
        book_author="Machado de Assis",
        book_cover_url="https://example.com/cover.jpg",
    )

    avg_row = MagicMock()
    avg_row.round_id = round_id
    avg_row.avg_rating = 4.75

    streak_user = _make_user()
    db = _build_compute_db(
        group=group,
        rounds=[round_],
        avg_rating_row=avg_row,
        streak_user=streak_user,
    )

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    assert result["highest_rated_book"] is not None
    assert result["highest_rated_book"]["title"] == "Dom Casmurro"
    assert result["highest_rated_book"]["avg_rating"] == 4.75
    assert result["highest_rated_book"]["cover_url"] == "https://example.com/cover.jpg"


@pytest.mark.asyncio
async def test_most_active_member_correct() -> None:
    """Membro com mais snapshots de progresso deve aparecer em most_active_member."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)
    user = _make_user(username="leitorativo", display_name="Leitor Ativo")

    streak_user = _make_user()
    db = _build_compute_db(
        group=group,
        rounds=[_make_round(group_id=group_id)],
        active_user=user,
        streak_user=streak_user,
    )

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    assert result["most_active_member"] is not None
    assert result["most_active_member"]["username"] == "leitorativo"
    assert result["most_active_member"]["display_name"] == "Leitor Ativo"


@pytest.mark.asyncio
async def test_funniest_oneliner_from_review() -> None:
    """O funny_oneliner mais recente de BookReview deve aparecer em funniest_oneliner."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)

    review = MagicMock()
    review.funny_oneliner = "Isso foi horrível de uma forma muito boa."

    author = _make_user(username="citador", display_name="Citador Pro")

    streak_user = _make_user()
    db = _build_compute_db(
        group=group,
        rounds=[_make_round(group_id=group_id)],
        oneliner_row=(review, author),
        streak_user=streak_user,
    )

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    assert result["funniest_oneliner"] is not None
    assert result["funniest_oneliner"]["text"] == "Isso foi horrível de uma forma muito boa."
    assert result["funniest_oneliner"]["vote_count"] == 0
    assert result["funniest_oneliner"]["author_username"] == "citador"


@pytest.mark.asyncio
async def test_most_emotional_book_highest_cried() -> None:
    """O livro com maior % de cried deve aparecer em most_emotional_book."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)

    round_id = uuid.uuid4()
    round_ = _make_round(
        id=round_id,
        group_id=group_id,
        book_title="A Culpa é das Estrelas",
        book_author="John Green",
    )

    emo_row = MagicMock()
    emo_row.round_id = round_id
    emo_row.total = 4
    emo_row.cried_count = 3

    streak_user = _make_user()
    db = _build_compute_db(
        group=group,
        rounds=[round_],
        emotional_row=emo_row,
        streak_user=streak_user,
    )

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    assert result["most_emotional_book"] is not None
    assert result["most_emotional_book"]["title"] == "A Culpa é das Estrelas"
    assert result["most_emotional_book"]["cried_percentage"] == 75.0


@pytest.mark.asyncio
async def test_member_superlatives_computed() -> None:
    """Todos os 5 superlatives devem estar presentes quando há dados suficientes."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)
    round_ = _make_round(group_id=group_id)

    user1 = _make_user(username="speed", streak_longest=30)
    user2 = _make_user(username="critic", streak_longest=10)
    user3 = _make_user(username="quotes", streak_longest=5)
    user4 = _make_user(username="chorao", streak_longest=2)
    user5 = _make_user(username="streak_king", streak_longest=90)

    def _row(user_id: object, **kwargs: object) -> MagicMock:
        r = MagicMock()
        r.user_id = user_id
        for k, v in kwargs.items():
            setattr(r, k, v)
        return r

    sup_rows = [
        _row(user1.id, total_minutes=300, book_count=3),  # speed reader
        _row(user2.id, review_count=5),  # critic
        _row(user3.id, quote_count=8),  # quotes
        _row(user4.id, total=4, cried_count=4),  # chorao
    ]

    streak_user = user5

    members = [user1, user2, user3, user4, user5]
    db = _build_compute_db(
        group=group,
        rounds=[round_],
        streak_user=streak_user,
        members=members,
        superlative_rows=sup_rows,
    )

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    titles = {s["title"] for s in result["member_superlatives"]}
    assert "Leitor Relâmpago" in titles
    assert "Crítico Literário" in titles
    assert "Mestre das Citações" in titles
    assert "Chorão Oficial" in titles
    assert "Sequência Imbatível" in titles
    assert len(result["member_superlatives"]) == 5


@pytest.mark.asyncio
async def test_genre_breakdown_percentages_sum_100() -> None:
    """Os percentages no genre_breakdown devem somar 100 (com tolerância de float)."""
    group_id = uuid.uuid4()
    group = _make_group(id=group_id)

    rounds = [
        _make_round(group_id=group_id, book_genres=["ficção", "aventura"]),
        _make_round(group_id=group_id, book_genres=["ficção"]),
    ]

    streak_user = _make_user()
    db = _build_compute_db(group=group, rounds=rounds, streak_user=streak_user)

    result = await _compute_wrapped_data(db, group_id=group_id, year=2025)

    breakdown = result["genre_breakdown"]
    assert len(breakdown) == 2
    total_pct = sum(item["percentage"] for item in breakdown)
    assert abs(total_pct - 100.0) < 0.1, f"Percentages devem somar 100, got {total_pct}"
