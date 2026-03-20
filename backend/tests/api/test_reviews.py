"""Testes unitários para app.api.v1.endpoints.reviews."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.reviews import reviews_router

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.include_router(reviews_router, prefix="/api/v1/rounds")


def _mock_user(**overrides: object) -> MagicMock:
    user = MagicMock()
    user.id = overrides.get("id", uuid.uuid4())
    user.username = overrides.get("username", "testuser")
    user.display_name = overrides.get("display_name", "Test User")
    user.avatar_url = overrides.get("avatar_url")
    user.is_active = True
    return user


def _mock_review(**overrides: object) -> MagicMock:
    review = MagicMock()
    review.id = overrides.get("id", uuid.uuid4())
    review.round_id = overrides.get("round_id", uuid.uuid4())
    review.user_id = overrides.get("user_id", uuid.uuid4())
    review.star_rating = overrides.get("star_rating", 4)
    review.cried = overrides.get("cried", False)
    review.loved_it = overrides.get("loved_it", True)
    review.felt_aroused = overrides.get("felt_aroused", False)
    review.found_heavy = overrides.get("found_heavy", False)
    review.wants_more_from_author = overrides.get("wants_more_from_author", True)
    review.sincere_review = overrides.get(
        "sincere_review", "Uma review sincera e longa o suficiente"
    )
    review.funny_oneliner = overrides.get("funny_oneliner")
    review.extra_thoughts = overrides.get("extra_thoughts")
    review.completed_at = overrides.get("completed_at", datetime.now(UTC))
    review.created_at = overrides.get("created_at", datetime.now(UTC))

    user_mock = MagicMock()
    user_mock.id = review.user_id
    user_mock.username = "reviewer"
    user_mock.display_name = "Reviewer"
    user_mock.avatar_url = None
    review.user = user_mock

    return review


def _override_deps(user: MagicMock) -> None:
    from app.core.deps import get_current_active_user, get_session

    async def fake_session() -> AsyncGenerator[AsyncMock, None]:
        yield AsyncMock()

    app.dependency_overrides[get_session] = fake_session
    app.dependency_overrides[get_current_active_user] = lambda: user


def _clear_deps() -> None:
    app.dependency_overrides.clear()


ROUND_ID = str(uuid.uuid4())
VALID_REVIEW_BODY = {
    "star_rating": 4,
    "cried": True,
    "loved_it": True,
    "felt_aroused": False,
    "found_heavy": False,
    "wants_more_from_author": True,
    "sincere_review": "Uma review sincera e longa o suficiente para validação",
}


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestSubmitReview:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.reviews.submit_review")
    def test_submit_success(self, mock_submit: MagicMock) -> None:
        review = _mock_review(user_id=self.user.id)
        mock_submit.return_value = review

        response = self.client.post(
            f"/api/v1/rounds/{ROUND_ID}/review",
            json=VALID_REVIEW_BODY,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["star_rating"] == review.star_rating
        assert data["user"]["username"] == "reviewer"

    @patch("app.api.v1.endpoints.reviews.submit_review")
    def test_submit_duplicate_returns_409(self, mock_submit: MagicMock) -> None:
        from app.services.review import ReviewError

        mock_submit.side_effect = ReviewError(
            "Você já enviou uma review para esta rodada.", status_code=409
        )

        response = self.client.post(
            f"/api/v1/rounds/{ROUND_ID}/review",
            json=VALID_REVIEW_BODY,
        )

        assert response.status_code == 409
        assert "já enviou" in response.json()["detail"]

    @patch("app.api.v1.endpoints.reviews.submit_review")
    def test_submit_wrong_status_returns_409(self, mock_submit: MagicMock) -> None:
        from app.services.review import ReviewError

        mock_submit.side_effect = ReviewError(
            "Reviews só podem ser enviadas durante a leitura ou fase de reviews.",
            status_code=409,
        )

        response = self.client.post(
            f"/api/v1/rounds/{ROUND_ID}/review",
            json=VALID_REVIEW_BODY,
        )

        assert response.status_code == 409

    def test_submit_validation_error_short_review(self) -> None:
        body = {**VALID_REVIEW_BODY, "sincere_review": "curto"}
        response = self.client.post(
            f"/api/v1/rounds/{ROUND_ID}/review",
            json=body,
        )
        assert response.status_code == 422

    def test_submit_validation_error_star_out_of_range(self) -> None:
        body = {**VALID_REVIEW_BODY, "star_rating": 6}
        response = self.client.post(
            f"/api/v1/rounds/{ROUND_ID}/review",
            json=body,
        )
        assert response.status_code == 422


class TestListReviews:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.reviews.get_all_reviews")
    def test_list_success(self, mock_get_all: MagicMock) -> None:
        reviews = [_mock_review(), _mock_review()]
        mock_get_all.return_value = reviews

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews")

        assert response.status_code == 200
        assert len(response.json()) == 2

    @patch("app.api.v1.endpoints.reviews.get_all_reviews")
    def test_list_without_own_review_returns_403(
        self, mock_get_all: MagicMock
    ) -> None:
        from app.services.review import ReviewError

        mock_get_all.side_effect = ReviewError(
            "Envie sua review primeiro!", status_code=403
        )

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews")

        assert response.status_code == 403
        assert "review primeiro" in response.json()["detail"]


class TestMyReview:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.reviews.get_my_review")
    def test_my_review_exists(self, mock_get: MagicMock) -> None:
        review = _mock_review(user_id=self.user.id)
        mock_get.return_value = review

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews/me")

        assert response.status_code == 200
        assert response.json()["star_rating"] == review.star_rating

    @patch("app.api.v1.endpoints.reviews.get_my_review")
    def test_my_review_not_found(self, mock_get: MagicMock) -> None:
        mock_get.return_value = None

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews/me")

        assert response.status_code == 404


class TestUpdateReview:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.reviews.update_review")
    def test_update_success(self, mock_update: MagicMock) -> None:
        review = _mock_review(user_id=self.user.id, star_rating=5)
        mock_update.return_value = review

        response = self.client.patch(
            f"/api/v1/rounds/{ROUND_ID}/reviews/me",
            json={"star_rating": 5},
        )

        assert response.status_code == 200
        assert response.json()["star_rating"] == 5

    @patch("app.api.v1.endpoints.reviews.update_review")
    def test_update_expired_returns_409(self, mock_update: MagicMock) -> None:
        from app.services.review import ReviewError

        mock_update.side_effect = ReviewError(
            "O prazo de 48h para editar a review expirou.", status_code=409
        )

        response = self.client.patch(
            f"/api/v1/rounds/{ROUND_ID}/reviews/me",
            json={"star_rating": 3},
        )

        assert response.status_code == 409
        assert "48h" in response.json()["detail"]


class TestReviewStats:
    def setup_method(self) -> None:
        self.user = _mock_user()
        _override_deps(self.user)
        self.client = TestClient(app, raise_server_exceptions=False)

    def teardown_method(self) -> None:
        _clear_deps()

    @patch("app.api.v1.endpoints.reviews.get_review_stats")
    def test_stats_success(self, mock_stats: MagicMock) -> None:
        mock_stats.return_value = {
            "total_reviews": 5,
            "avg_star_rating": 3.8,
            "cried_count": 2,
            "loved_it_count": 4,
            "felt_aroused_count": 1,
            "found_heavy_count": 3,
            "wants_more_count": 4,
        }

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["total_reviews"] == 5
        assert data["avg_star_rating"] == 3.8

    @patch("app.api.v1.endpoints.reviews.get_review_stats")
    def test_stats_without_review_returns_403(
        self, mock_stats: MagicMock
    ) -> None:
        from app.services.review import ReviewError

        mock_stats.side_effect = ReviewError(
            "Envie sua review primeiro!", status_code=403
        )

        response = self.client.get(f"/api/v1/rounds/{ROUND_ID}/reviews/stats")

        assert response.status_code == 403
