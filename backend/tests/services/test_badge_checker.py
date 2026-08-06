"""Testes unitários para app.services.badge_checker."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import replace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.badge_checker import (
    BADGES,
    _check_and_award,
    _count_groups_founded,
    _count_night_sessions,
    _load_badge_ids,
)

Measure = Callable[..., Awaitable[int]]


def _mock_scalar_result(value: object) -> MagicMock:
    result = MagicMock()
    result.scalar_one.return_value = value
    result.scalar_one_or_none.return_value = value
    return result


def _measuring(value: int) -> Measure:
    """Medição fixa — exercita a derivação do award sem tocar o banco."""

    async def _measure(db: object, user_id: uuid.UUID, ctx: Mapping[str, str]) -> int:
        return value

    return _measure


# ── O registry é a única fonte da regra ────────────────────────────────────────


class TestRegistryDrivesAward:
    """`measure >= target` ⟺ badge concedido, para todo slug do registry.

    É o teste que a duplicação entre `_CHECKERS` e `_BADGE_TARGETS` tornava
    impossível: com duas cópias da regra, medir uma não dizia nada sobre a outra.
    """

    @pytest.mark.parametrize("slug", sorted(BADGES))
    @pytest.mark.asyncio
    async def test_awards_exactly_when_measure_reaches_target(self, slug: str) -> None:
        spec = BADGES[slug]
        user_id = uuid.uuid4()
        badge_ids = {slug: uuid.uuid4()}

        for measured, should_award in (
            (spec.target - 1, False),
            (spec.target, True),
            (spec.target + 1, True),
        ):
            db = AsyncMock()
            db.execute = AsyncMock(return_value=MagicMock())
            BADGES[slug] = replace(spec, measure=_measuring(measured))
            try:
                await _check_and_award(db, user_id, slug, {}, badge_ids)
            finally:
                BADGES[slug] = spec

            awarded = db.execute.await_count == 1
            assert awarded is should_award, (
                f"{slug}: medida {measured} contra alvo {spec.target} — "
                f"esperado {'conceder' if should_award else 'não conceder'}"
            )

    @pytest.mark.parametrize("slug", sorted(BADGES))
    def test_target_is_positive(self, slug: str) -> None:
        """Alvo zero ou negativo tornaria o badge automático."""
        assert BADGES[slug].target >= 1

    @pytest.mark.asyncio
    async def test_unknown_slug_is_ignored(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        await _check_and_award(db, uuid.uuid4(), "slug_inexistente", {}, {})

        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_award_when_badge_missing_from_catalog(self) -> None:
        """Sem linha em `badges` não há badge_id — nada é inserido."""
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())

        spec = BADGES["founder"]
        BADGES["founder"] = replace(spec, measure=_measuring(99))
        try:
            await _check_and_award(db, uuid.uuid4(), "founder", {}, {})
        finally:
            BADGES["founder"] = spec

        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_scoped_badge_records_event_context(self) -> None:
        """Badge com `scoped=True` guarda group_id/round_id do evento."""
        group_id, round_id = uuid.uuid4(), uuid.uuid4()
        ctx = {"group_id": str(group_id), "round_id": str(round_id)}

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())
        spec = BADGES["founder"]
        assert spec.scoped is True
        BADGES["founder"] = replace(spec, measure=_measuring(spec.target))
        try:
            await _check_and_award(db, uuid.uuid4(), "founder", ctx, {"founder": uuid.uuid4()})
        finally:
            BADGES["founder"] = spec

        values = db.execute.await_args.args[0].compile().params
        assert values["group_id"] == group_id
        assert values["round_id"] == round_id

    @pytest.mark.asyncio
    async def test_unscoped_badge_ignores_event_context(self) -> None:
        """Badge sem escopo não amarra a conquista a um grupo/rodada."""
        ctx = {"group_id": str(uuid.uuid4()), "round_id": str(uuid.uuid4())}

        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock())
        spec = BADGES["bookworm"]
        assert spec.scoped is False
        BADGES["bookworm"] = replace(spec, measure=_measuring(spec.target))
        try:
            await _check_and_award(db, uuid.uuid4(), "bookworm", ctx, {"bookworm": uuid.uuid4()})
        finally:
            BADGES["bookworm"] = spec

        values = db.execute.await_args.args[0].compile().params
        assert values["group_id"] is None
        assert values["round_id"] is None


# ── _load_badge_ids ────────────────────────────────────────────────────────────


class TestLoadBadgeIds:
    @pytest.mark.asyncio
    async def test_resolves_all_slugs_in_a_single_query(self) -> None:
        """Uma query por evento, não uma por badge."""
        ids = {"bookworm": uuid.uuid4(), "variety": uuid.uuid4()}

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = list(ids.items())
        db.execute = AsyncMock(return_value=result)

        loaded = await _load_badge_ids(db, ["bookworm", "variety"])

        assert loaded == ids
        assert db.execute.await_count == 1


# ── _count_night_sessions ──────────────────────────────────────────────────────


def _rendered_sql(call: object) -> str:
    return str(call.args[0].compile(compile_kwargs={"literal_binds": True}))


class TestCountNightSessions:
    @pytest.mark.asyncio
    async def test_uses_user_timezone_and_has_no_dead_predicate(self) -> None:
        """Janela de 0h–5h no fuso do usuário; `hour >= 0` (tautologia) não existe mais."""
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_mock_scalar_result("America/Sao_Paulo"), _mock_scalar_result(7)])

        count = await _count_night_sessions(db, uuid.uuid4(), {})

        assert count == 7
        sql = _rendered_sql(db.execute.await_args_list[1])
        assert "America/Sao_Paulo" in sql
        assert ">= 0" not in sql
        assert sql.lower().count("extract") == 1

    @pytest.mark.asyncio
    async def test_falls_back_to_utc_on_invalid_timezone(self) -> None:
        """Fuso inválido no perfil não pode quebrar a query."""
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[_mock_scalar_result("Marte/Olympus"), _mock_scalar_result(0)])

        count = await _count_night_sessions(db, uuid.uuid4(), {})

        assert count == 0
        assert "UTC" in _rendered_sql(db.execute.await_args_list[1])


# ── _count_groups_founded ──────────────────────────────────────────────────────


class TestCountGroupsFounded:
    @pytest.mark.asyncio
    async def test_counts_active_groups_created_by_user(self) -> None:
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(3))

        assert await _count_groups_founded(db, uuid.uuid4(), {}) == 3

    @pytest.mark.asyncio
    async def test_returns_zero_when_scalar_is_none(self) -> None:
        """Sem grupos criados o COUNT vem nulo — 0, não exceção."""
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(None))

        assert await _count_groups_founded(db, uuid.uuid4(), {}) == 0
