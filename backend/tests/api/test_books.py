"""Testes unitários para os endpoints de busca de livros."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.books import get_hardcover_client, router
from app.core.deps import get_current_user_id
from app.schemas.hardcover import BookDetail, BookResult

# ── Fixtures ──────────────────────────────────────────────────────────────────

FAKE_USER_ID = str(uuid.uuid4())

SAMPLE_RESULT = BookResult(
    book_id="1",
    title="Dom Casmurro",
    author="Machado de Assis",
    cover_url="https://example.com/cover.jpg",
    slug="dom-casmurro",
    description="Um clássico brasileiro.",
    page_count=256,
)

SAMPLE_DETAIL = BookDetail(
    book_id="1",
    title="Dom Casmurro",
    author="Machado de Assis",
    cover_url="https://example.com/cover.jpg",
    slug="dom-casmurro",
    description="Um clássico brasileiro.",
    page_count=256,
    genres=["Romance", "Clássico"],
)


def _make_app(mock_client: AsyncMock, *, with_auth: bool = True) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/books")

    if with_auth:
        app.dependency_overrides[get_current_user_id] = lambda: FAKE_USER_ID

    app.dependency_overrides[get_hardcover_client] = lambda: mock_client
    return app


# ── TestSearchBooks ───────────────────────────────────────────────────────────


class TestSearchBooks:
    def test_search_returns_results(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[SAMPLE_RESULT])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search", params={"q": "machado"})

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["book_id"] == "1"
        assert data[0]["title"] == "Dom Casmurro"
        assert data[0]["author"] == "Machado de Assis"

    def test_search_empty_results(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search", params={"q": "xyz123inexistente"})

        assert response.status_code == 200
        assert response.json() == []

    def test_search_missing_query_returns_422(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search")

        assert response.status_code == 422

    def test_search_empty_query_returns_422(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search", params={"q": ""})

        assert response.status_code == 422

    def test_search_custom_limit(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        client.get("/api/v1/books/search", params={"q": "machado", "limit": 25})

        mock_client.search_books.assert_called_once_with("machado", limit=25)

    def test_search_limit_too_high_returns_422(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search", params={"q": "machado", "limit": 100})

        assert response.status_code == 422

    def test_search_limit_zero_returns_422(self) -> None:
        mock_client = AsyncMock()
        mock_client.search_books = AsyncMock(return_value=[])
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/search", params={"q": "machado", "limit": 0})

        assert response.status_code == 422

    def test_search_requires_auth(self) -> None:
        mock_client = AsyncMock()
        client = TestClient(_make_app(mock_client, with_auth=False), raise_server_exceptions=False)

        response = client.get("/api/v1/books/search", params={"q": "machado"})

        assert response.status_code == 401


# ── TestGetBook ───────────────────────────────────────────────────────────────


class TestGetBook:
    def test_get_book_returns_detail(self) -> None:
        mock_client = AsyncMock()
        mock_client.get_book = AsyncMock(return_value=SAMPLE_DETAIL)
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/dom-casmurro")

        assert response.status_code == 200
        data = response.json()
        assert data["book_id"] == "1"
        assert data["slug"] == "dom-casmurro"
        assert "Romance" in data["genres"]

    def test_get_book_not_found(self) -> None:
        mock_client = AsyncMock()
        mock_client.get_book = AsyncMock(return_value=None)
        client = TestClient(_make_app(mock_client))

        response = client.get("/api/v1/books/slug-inexistente")

        assert response.status_code == 404
        assert response.json()["detail"] == "Livro não encontrado."

    def test_get_book_requires_auth(self) -> None:
        mock_client = AsyncMock()
        client = TestClient(_make_app(mock_client, with_auth=False), raise_server_exceptions=False)

        response = client.get("/api/v1/books/dom-casmurro")

        assert response.status_code == 401
