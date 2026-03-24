"""Testes unitários para os endpoints de rodadas."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.rounds import group_rounds_router, rounds_router
from app.core.deps import (
    get_current_active_user,
    get_group_admin_membership,
    get_group_membership,
    get_session,
)
from app.db.models.group import GroupRole
from app.db.models.round import RoundStatus
from app.services.round import RoundError
from tests.conftest import make_user

# ── Factories ──────────────────────────────────────────────────────────────────


def _make_round(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.group_id = overrides.get("group_id", uuid.uuid4())
    r.round_number = overrides.get("round_number", 1)
    r.status = overrides.get("status", RoundStatus.NOMINATING)
    r.deadline = overrides.get("deadline")
    r.book_id = overrides.get("book_id")
    r.book_title = overrides.get("book_title")
    r.book_author = overrides.get("book_author")
    r.book_cover_url = overrides.get("book_cover_url")
    r.book_page_count = overrides.get("book_page_count")
    r.started_at = overrides.get("started_at")
    r.finished_at = overrides.get("finished_at")
    r.created_at = overrides.get("created_at", datetime(2026, 1, 1, tzinfo=UTC))
    r.nominations = overrides.get("nominations", [])
    r.tiebreak_info = overrides.get("tiebreak_info")
    return r


def _make_nomination(**overrides: object) -> MagicMock:
    n = MagicMock()
    n.id = overrides.get("id", uuid.uuid4())
    n.book_id = overrides.get("book_id", "b-1")
    n.book_title = overrides.get("book_title", "Dom Casmurro")
    n.book_author = overrides.get("book_author", "Machado de Assis")
    n.book_cover_url = overrides.get("book_cover_url")
    n.book_hardcover_slug = overrides.get("book_hardcover_slug")
    n.book_page_count = overrides.get("book_page_count")
    n.pitch = overrides.get("pitch")
    n.user_id = overrides.get("user_id", uuid.uuid4())
    n.nominated_at = overrides.get("nominated_at", datetime(2026, 1, 2, tzinfo=UTC))
    n.votes = overrides.get("votes", [])
    return n


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    m.role = overrides.get("role", GroupRole.ADMIN)
    return m


FAKE_USER = make_user()
FAKE_ADMIN_MEMBER = _make_member(user_id=FAKE_USER.id, role=GroupRole.ADMIN)
FAKE_MEMBER = _make_member(user_id=FAKE_USER.id, role=GroupRole.MEMBER)
FAKE_DB = AsyncMock()


def _make_group_app(*, admin: bool = True) -> FastAPI:
    """Create app with group_rounds_router and overridden deps."""
    app = FastAPI()
    app.include_router(
        group_rounds_router,
        prefix="/api/v1/groups/{group_id}/rounds",
    )
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    member = FAKE_ADMIN_MEMBER if admin else FAKE_MEMBER
    app.dependency_overrides[get_group_membership] = lambda: member
    app.dependency_overrides[get_group_admin_membership] = lambda: FAKE_ADMIN_MEMBER
    return app


def _make_rounds_app() -> FastAPI:
    """Create app with rounds_router and overridden deps."""
    app = FastAPI()
    app.include_router(rounds_router, prefix="/api/v1/rounds")
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    return app


GROUP_ID = uuid.uuid4()


# ── POST /groups/{group_id}/rounds ─────────────────────────────────────────────


class TestCreateRound:
    def test_create_round_success(self) -> None:
        round_ = _make_round(round_number=1)
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.create_round",
            new=AsyncMock(return_value=round_),
        ):
            response = client.post(
                f"/api/v1/groups/{GROUP_ID}/rounds",
                json={},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["round_number"] == 1
        assert data["status"] == "nominating"

    def test_create_round_with_deadline(self) -> None:
        round_ = _make_round(deadline=date(2030, 12, 31))
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.create_round",
            new=AsyncMock(return_value=round_),
        ):
            response = client.post(
                f"/api/v1/groups/{GROUP_ID}/rounds",
                json={"deadline": "2030-12-31"},
            )

        assert response.status_code == 201

    def test_create_round_active_exists_returns_409(self) -> None:
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.create_round",
            new=AsyncMock(side_effect=RoundError("Já existe uma rodada ativa neste clube.", status_code=409)),
        ):
            response = client.post(
                f"/api/v1/groups/{GROUP_ID}/rounds",
                json={},
            )

        assert response.status_code == 409
        assert "rodada ativa" in response.json()["detail"]

    def test_create_round_deadline_past_returns_422(self) -> None:
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.create_round",
            new=AsyncMock(side_effect=RoundError("O prazo deve ser uma data futura.", status_code=422)),
        ):
            response = client.post(
                f"/api/v1/groups/{GROUP_ID}/rounds",
                json={"deadline": "2000-01-01"},
            )

        assert response.status_code == 422


# ── GET /groups/{group_id}/rounds ──────────────────────────────────────────────


class TestListRounds:
    def test_list_rounds_empty(self) -> None:
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.list_rounds",
            new=AsyncMock(return_value=([], None)),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds")

        assert response.status_code == 200
        data = response.json()
        assert data["rounds"] == []
        assert data["next_cursor"] is None

    def test_list_rounds_with_items(self) -> None:
        rounds = [_make_round(round_number=2), _make_round(round_number=1)]
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.list_rounds",
            new=AsyncMock(return_value=(rounds, None)),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds")

        assert response.status_code == 200
        data = response.json()
        assert len(data["rounds"]) == 2

    def test_list_rounds_with_next_cursor(self) -> None:
        rounds = [_make_round(round_number=1)]
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.list_rounds",
            new=AsyncMock(return_value=(rounds, 1)),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds")

        data = response.json()
        assert data["next_cursor"] == 1


# ── GET /groups/{group_id}/rounds/current ──────────────────────────────────────


class TestGetCurrentRound:
    def test_current_round_found(self) -> None:
        nom = _make_nomination(votes=[MagicMock(), MagicMock()])
        round_ = _make_round(status=RoundStatus.VOTING, nominations=[nom])
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.get_current_round",
            new=AsyncMock(return_value=round_),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds/current")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "voting"
        assert len(data["nominations"]) == 1
        assert data["nominations"][0]["vote_count"] == 2

    def test_current_round_not_found(self) -> None:
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.get_current_round",
            new=AsyncMock(return_value=None),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds/current")

        assert response.status_code == 404
        assert "rodada ativa" in response.json()["detail"].lower()

    def test_current_round_tiebreak_info_null_by_default(self) -> None:
        round_ = _make_round(status=RoundStatus.NOMINATING)
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.get_current_round",
            new=AsyncMock(return_value=round_),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds/current")

        assert response.status_code == 200
        assert response.json()["tiebreak_info"] is None

    def test_current_round_tiebreak_info_populated(self) -> None:
        tiebreak = {
            "was_tiebreak": True,
            "tied_nominations": [],
            "winner_id": "nom-uuid",
            "method": "random",
        }
        round_ = _make_round(status=RoundStatus.READING, tiebreak_info=tiebreak)
        app = _make_group_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.get_current_round",
            new=AsyncMock(return_value=round_),
        ):
            response = client.get(f"/api/v1/groups/{GROUP_ID}/rounds/current")

        assert response.status_code == 200
        data = response.json()
        assert data["tiebreak_info"] == tiebreak


# ── PATCH /rounds/{round_id} ───────────────────────────────────────────────────


class TestUpdateRound:
    def test_update_status_success(self) -> None:
        round_ = _make_round(status=RoundStatus.VOTING)
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.update_round",
                new=AsyncMock(return_value=round_),
            ),
        ):
            response = client.patch(
                f"/api/v1/rounds/{round_id}",
                json={"status": "voting"},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "voting"

    def test_update_no_fields_returns_422(self) -> None:
        round_ = _make_round()
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.update_round",
                new=AsyncMock(side_effect=RoundError("Informe ao menos um campo para atualizar.", status_code=422)),
            ),
        ):
            response = client.patch(
                f"/api/v1/rounds/{round_id}",
                json={},
            )

        assert response.status_code == 422

    def test_update_invalid_transition_returns_422(self) -> None:
        round_ = _make_round(status=RoundStatus.NOMINATING)
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.update_round",
                new=AsyncMock(
                    side_effect=RoundError(
                        "Transição de 'nominating' para 'finished' não é permitida.",
                        status_code=422,
                    )
                ),
            ),
        ):
            response = client.patch(
                f"/api/v1/rounds/{round_id}",
                json={"status": "finished"},
            )

        assert response.status_code == 422

    def test_update_not_admin_returns_403(self) -> None:
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.verify_round_admin",
            new=AsyncMock(side_effect=RoundError("Apenas administradores podem realizar esta ação.", status_code=403)),
        ):
            response = client.patch(
                f"/api/v1/rounds/{round_id}",
                json={"status": "voting"},
            )

        assert response.status_code == 403

    def test_update_not_found_returns_404(self) -> None:
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.verify_round_admin",
            new=AsyncMock(side_effect=RoundError("Rodada não encontrada.", status_code=404)),
        ):
            response = client.patch(
                f"/api/v1/rounds/{round_id}",
                json={"status": "voting"},
            )

        assert response.status_code == 404


# ── DELETE /rounds/{round_id} ─────────────────────────────────────────────────


class TestDeleteRound:
    def test_delete_round_success(self) -> None:
        round_ = _make_round(status=RoundStatus.NOMINATING)
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.delete_round",
                new=AsyncMock(return_value=None),
            ),
        ):
            response = client.delete(f"/api/v1/rounds/{round_id}")

        assert response.status_code == 200
        assert "removida" in response.json()["message"]

    def test_delete_not_nominating_returns_409(self) -> None:
        round_ = _make_round(status=RoundStatus.VOTING)
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.delete_round",
                new=AsyncMock(
                    side_effect=RoundError(
                        "Apenas rodadas em fase de indicação podem ser removidas.",
                        status_code=409,
                    )
                ),
            ),
        ):
            response = client.delete(f"/api/v1/rounds/{round_id}")

        assert response.status_code == 409

    def test_delete_not_found_returns_404(self) -> None:
        round_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.rounds.verify_round_admin",
            new=AsyncMock(side_effect=RoundError("Rodada não encontrada.", status_code=404)),
        ):
            response = client.delete(f"/api/v1/rounds/{round_id}")

        assert response.status_code == 404


# ── Badge integration: finish_round + log_reading_progress ─────────────────────


class TestFinishRoundBadges:
    """Verifica que check_and_award_badges é disparado para todos os membros."""

    def test_finish_round_triggers_badge_for_admin(self) -> None:
        round_ = _make_round(status=RoundStatus.READING)
        round_id = round_.id
        app = _make_rounds_app()
        client = TestClient(app)

        member_result = MagicMock()
        member_result.all.return_value = [(FAKE_USER.id,)]
        FAKE_DB.execute = AsyncMock(return_value=member_result)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.finish_round",
                new=AsyncMock(return_value=round_),
            ),
            patch("app.api.v1.endpoints.rounds.invalidate_group_stats", new=AsyncMock()),
            patch("app.api.v1.endpoints.rounds.populate_shelf_cache"),
            patch(
                "app.api.v1.endpoints.rounds.check_and_award_badges",
                new=AsyncMock(),
            ) as mock_award,
        ):
            response = client.post(f"/api/v1/rounds/{round_id}/finish")

        assert response.status_code == 200
        calls = mock_award.call_args_list
        user_ids_called = [c.args[0] for c in calls]
        assert str(FAKE_USER.id) in user_ids_called

    def test_finish_round_triggers_badge_for_other_members(self) -> None:
        """Outros membros além do admin também recebem o evento book_finished."""
        round_ = _make_round(status=RoundStatus.READING)
        round_id = round_.id
        other_member_id = uuid.uuid4()
        app = _make_rounds_app()
        client = TestClient(app)

        member_result = MagicMock()
        member_result.all.return_value = [(FAKE_USER.id,), (other_member_id,)]
        FAKE_DB.execute = AsyncMock(return_value=member_result)

        with (
            patch(
                "app.api.v1.endpoints.rounds.verify_round_admin",
                new=AsyncMock(return_value=round_),
            ),
            patch(
                "app.api.v1.endpoints.rounds.finish_round",
                new=AsyncMock(return_value=round_),
            ),
            patch("app.api.v1.endpoints.rounds.invalidate_group_stats", new=AsyncMock()),
            patch("app.api.v1.endpoints.rounds.populate_shelf_cache"),
            patch(
                "app.api.v1.endpoints.rounds.check_and_award_badges",
                new=AsyncMock(),
            ) as mock_award,
        ):
            response = client.post(f"/api/v1/rounds/{round_id}/finish")

        assert response.status_code == 200
        calls = mock_award.call_args_list
        user_ids_called = [c.args[0] for c in calls]
        assert str(other_member_id) in user_ids_called
        events_called = [c.args[1] for c in calls]
        assert all(e == "book_finished" for e in events_called)


class TestLogReadingProgressBadges:
    """Verifica que streak_updated é disparado ao registrar progresso."""

    @staticmethod
    def _make_progress(**overrides: object) -> MagicMock:
        p = MagicMock()
        p.id = overrides.get("id", uuid.uuid4())
        p.round_id = overrides.get("round_id", uuid.uuid4())
        p.user_id = overrides.get("user_id", uuid.uuid4())
        p.current_page = overrides.get("current_page", 50)
        p.percentage = overrides.get("percentage", 50.0)
        p.progress_type = overrides.get("progress_type", "page")
        p.total_pages = overrides.get("total_pages", 100)
        p.note = overrides.get("note")
        p.created_at = overrides.get("created_at", datetime(2026, 3, 1, tzinfo=UTC))
        return p

    def test_log_progress_triggers_streak_updated(self) -> None:
        round_id = uuid.uuid4()
        progress = TestLogReadingProgressBadges._make_progress(round_id=round_id)
        app = _make_rounds_app()
        client = TestClient(app)

        with (
            patch(
                "app.api.v1.endpoints.rounds.reading_progress_service.log_progress",
                new=AsyncMock(return_value=progress),
            ),
            patch(
                "app.api.v1.endpoints.rounds.check_and_award_badges",
                new=AsyncMock(),
            ) as mock_award,
        ):
            response = client.post(
                f"/api/v1/rounds/{round_id}/progress",
                json={"current_page": 50, "total_pages": 100, "progress_type": "page"},
            )

        assert response.status_code == 201
        mock_award.assert_called_once()
        call_args = mock_award.call_args
        assert call_args.args[1] == "streak_updated"
