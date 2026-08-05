"""Regressão do bug de #202: submeter review terminava o livro pela metade.

`submit_review` inseria uma linha de ReadingProgress na mão, por fora de
`log_progress`. Consequência: streak não subia, nenhum evento SSE saía, e o
endpoint só disparava `review_submitted` — então `first_blood` e `speed_reader`,
que estão em `book_finished` (`badge_checker.py:33`), nunca eram reavaliados para
quem terminou o livro por esse caminho.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.db.models.round import RoundStatus
from app.services.review import submit_review
from tests.conftest import RecordingAfterCommit


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.status = overrides.get("status", RoundStatus.REVIEWING)
    r.book_page_count = overrides.get("book_page_count", 320)
    return r


def _make_review_request() -> MagicMock:
    data = MagicMock()
    data.star_rating = 5
    data.cried = True
    data.loved_it = True
    data.felt_aroused = False
    data.found_heavy = False
    data.wants_more_from_author = True
    data.sincere_review = "Muito bom."
    data.funny_oneliner = None
    data.extra_thoughts = None
    return data


def _db_for_submit(*, already_finished: bool, streak_last_update: object = None) -> AsyncMock:
    """db mock na ordem que submit_review consulta.

    duplicata de review → idempotência de mark_finished → fast streak read →
    streak lock → grupos do usuário → reload da review.
    """
    res_none = MagicMock()
    res_none.scalar_one_or_none.return_value = None

    res_finished = MagicMock()
    res_finished.scalar_one_or_none.return_value = uuid.uuid4() if already_finished else None

    fast_row = MagicMock()
    fast_row.streak_last_update = streak_last_update
    fast_row.timezone = "America/Sao_Paulo"
    res_fast = MagicMock()
    res_fast.one_or_none.return_value = fast_row

    user = MagicMock()
    user.streak_current = 0
    user.streak_longest = 0
    user.streak_last_update = streak_last_update
    # _update_streak relê o timezone depois de travar a linha
    user.timezone = "America/Sao_Paulo"
    res_user = MagicMock()
    res_user.scalar_one_or_none.return_value = user

    res_groups = MagicMock()
    res_groups.all.return_value = []

    res_reload = MagicMock()
    res_reload.scalar_one.return_value = MagicMock(group_id=uuid.uuid4())

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[res_none, res_finished, res_fast, res_user, res_groups, res_reload])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db._user = user
    return db


class TestSubmitReviewFinishesTheBook:
    @pytest.mark.asyncio
    async def test_schedules_book_finished_not_only_review_submitted(self) -> None:
        """O bug: só `review_submitted` era agendado, então `first_blood` e
        `speed_reader` nunca eram reavaliados por este caminho."""
        round_ = _make_round(status=RoundStatus.REVIEWING)
        after_commit = RecordingAfterCommit()
        db = _db_for_submit(already_finished=False)

        with (
            patch("app.services.review.verify_round_member", new=AsyncMock(return_value=round_)),
            patch("app.services.review.sanitize", side_effect=lambda v: v),
            patch("app.services.review.emit_group_event", new=AsyncMock()),
            patch("app.services.reading_progress.get_redis", return_value=AsyncMock()),
        ):
            await submit_review(
                db,
                round_id=round_.id,
                user_id=uuid.uuid4(),
                data=_make_review_request(),
                after_commit=after_commit,
            )

        assert after_commit.event_types == [
            "streak_updated",
            "book_finished",
            "review_submitted",
        ]

    @pytest.mark.asyncio
    async def test_bumps_streak(self) -> None:
        """O caminho de review não tocava o streak do usuário."""
        round_ = _make_round(status=RoundStatus.REVIEWING)
        db = _db_for_submit(already_finished=False)

        with (
            patch("app.services.review.verify_round_member", new=AsyncMock(return_value=round_)),
            patch("app.services.review.sanitize", side_effect=lambda v: v),
            patch("app.services.review.emit_group_event", new=AsyncMock()),
            patch("app.services.reading_progress.get_redis", return_value=AsyncMock()),
        ):
            await submit_review(
                db,
                round_id=round_.id,
                user_id=uuid.uuid4(),
                data=_make_review_request(),
                after_commit=RecordingAfterCommit(),
            )

        assert db._user.streak_current == 1
        assert db._user.streak_last_update is not None

    @pytest.mark.asyncio
    async def test_writes_finished_snapshot(self) -> None:
        round_ = _make_round(status=RoundStatus.REVIEWING, book_page_count=320)
        db = _db_for_submit(already_finished=False)

        with (
            patch("app.services.review.verify_round_member", new=AsyncMock(return_value=round_)),
            patch("app.services.review.sanitize", side_effect=lambda v: v),
            patch("app.services.review.emit_group_event", new=AsyncMock()),
            patch("app.services.reading_progress.get_redis", return_value=AsyncMock()),
        ):
            await submit_review(
                db,
                round_id=round_.id,
                user_id=uuid.uuid4(),
                data=_make_review_request(),
                after_commit=RecordingAfterCommit(),
            )

        added = [c.args[0] for c in db.add.call_args_list]
        progress = [a for a in added if getattr(a, "progress_type", None) == "finished"]
        assert len(progress) == 1
        assert progress[0].percentage == 100.0
        assert progress[0].current_page == 320

    @pytest.mark.asyncio
    async def test_does_not_duplicate_when_already_finished(self) -> None:
        """Quem já marcou 100% pelo timer não ganha snapshot nem badge duplicados."""
        round_ = _make_round(status=RoundStatus.REVIEWING)
        after_commit = RecordingAfterCommit()
        db = _db_for_submit(already_finished=True)

        with (
            patch("app.services.review.verify_round_member", new=AsyncMock(return_value=round_)),
            patch("app.services.review.sanitize", side_effect=lambda v: v),
            patch("app.services.review.emit_group_event", new=AsyncMock()),
            patch("app.services.reading_progress.get_redis", return_value=AsyncMock()),
        ):
            await submit_review(
                db,
                round_id=round_.id,
                user_id=uuid.uuid4(),
                data=_make_review_request(),
                after_commit=after_commit,
            )

        added = [c.args[0] for c in db.add.call_args_list]
        assert not [a for a in added if getattr(a, "progress_type", None) == "finished"]
        assert after_commit.event_types == ["review_submitted"]
