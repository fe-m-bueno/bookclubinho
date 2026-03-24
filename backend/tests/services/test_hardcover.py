"""Testes unitários para HardcoverClient — sem I/O real."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import orjson
import pytest

from app.schemas.hardcover import BookDetail, BookResult
from app.services.hardcover import HardcoverClient

# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_client() -> HardcoverClient:
    return HardcoverClient(api_url="https://api.example.com/graphql", api_token="tok")


def _search_hit(
    book_id: int = 1,
    title: str = "Dom Casmurro",
    slug: str = "dom-casmurro",
    author_name: str | None = "Machado de Assis",
    pages: int | None = 256,
    cover_url: str | None = "https://img.example.com/cover.jpg",
    description: str | None = "Um clássico.",
) -> dict[str, Any]:
    return {
        "document": {
            "id": book_id,
            "title": title,
            "slug": slug,
            "description": description,
            "pages": pages,
            "image": {"url": cover_url} if cover_url else None,
            "contributions": [{"author": {"name": author_name}}] if author_name else [],
        }
    }


def _book_row(
    book_id: int = 1,
    title: str = "Dom Casmurro",
    slug: str = "dom-casmurro",
    author_name: str | None = "Machado de Assis",
    pages: int | None = 256,
    cover_url: str | None = "https://img.example.com/cover.jpg",
    description: str | None = "Um clássico.",
    genres: list[str] | None = None,
) -> dict[str, Any]:
    resolved_genres = genres if genres is not None else ["Fiction"]
    # O serviço lê géneros de cached_tags.Genre (formato atual da API Hardcover)
    return {
        "id": book_id,
        "title": title,
        "slug": slug,
        "description": description,
        "pages": pages,
        "image": {"url": cover_url} if cover_url else None,
        "contributions": [{"author": {"name": author_name}}] if author_name else [],
        "cached_tags": {"Genre": [{"tag": g} for g in resolved_genres]},
    }


def _redis_mock(cached: Any = None) -> AsyncMock:
    mock = AsyncMock()
    mock.get = AsyncMock(return_value=cached)
    mock.set = AsyncMock(return_value=True)
    return mock


# ── TestCacheKeys ──────────────────────────────────────────────────────────────


class TestCacheKeys:
    def test_search_key_deterministic(self) -> None:
        client = _make_client()
        k1 = client._cache_key_search("machado", 10)
        k2 = client._cache_key_search("machado", 10)
        assert k1 == k2

    def test_search_key_case_insensitive(self) -> None:
        client = _make_client()
        assert client._cache_key_search("Machado", 10) == client._cache_key_search("machado", 10)

    def test_search_key_varies_by_limit(self) -> None:
        client = _make_client()
        assert client._cache_key_search("machado", 5) != client._cache_key_search("machado", 10)

    def test_search_key_prefix(self) -> None:
        client = _make_client()
        assert client._cache_key_search("machado", 10).startswith("hc:search:")

    def test_book_key_uses_slug(self) -> None:
        client = _make_client()
        assert client._cache_key_book("dom-casmurro") == "hc:book:dom-casmurro"

    def test_book_key_differs_by_slug(self) -> None:
        client = _make_client()
        assert client._cache_key_book("livro-a") != client._cache_key_book("livro-b")


# ── TestParseSearchResults ────────────────────────────────────────────────────


class TestParseSearchResults:
    def test_valid_results(self) -> None:
        client = _make_client()
        data = {"search": {"results": {"hits": [_search_hit()]}}}
        results = client._parse_search_results(data)
        assert len(results) == 1
        r = results[0]
        assert r.book_id == "1"
        assert r.title == "Dom Casmurro"
        assert r.author == "Machado de Assis"
        assert r.slug == "dom-casmurro"

    def test_empty_results(self) -> None:
        client = _make_client()
        data: dict[str, Any] = {"search": {"results": {"hits": []}}}
        assert client._parse_search_results(data) == []

    def test_missing_author_returns_unknown(self) -> None:
        client = _make_client()
        data = {"search": {"results": {"hits": [_search_hit(author_name=None)]}}}
        results = client._parse_search_results(data)
        assert results[0].author == "Unknown"

    def test_malformed_entry_is_skipped(self) -> None:
        client = _make_client()
        good = _search_hit()
        bad: dict[str, Any] = {"document": {}}  # sem 'id'
        data = {"search": {"results": {"hits": [bad, good]}}}
        results = client._parse_search_results(data)
        assert len(results) == 1
        assert results[0].title == "Dom Casmurro"

    def test_missing_search_key(self) -> None:
        client = _make_client()
        assert client._parse_search_results({}) == []


# ── TestParseBookDetail ───────────────────────────────────────────────────────


class TestParseBookDetail:
    def test_book_with_genres(self) -> None:
        client = _make_client()
        data = {"books": [_book_row(genres=["Romance", "Drama"])]}
        detail = client._parse_book_detail(data)
        assert detail is not None
        assert detail.genres == ["Romance", "Drama"]
        assert detail.book_id == "1"

    def test_empty_books_returns_none(self) -> None:
        client = _make_client()
        assert client._parse_book_detail({"books": []}) is None

    def test_missing_books_key_returns_none(self) -> None:
        client = _make_client()
        assert client._parse_book_detail({}) is None

    def test_missing_author_returns_unknown(self) -> None:
        client = _make_client()
        data = {"books": [_book_row(author_name=None, genres=[])]}
        detail = client._parse_book_detail(data)
        assert detail is not None
        assert detail.author == "Unknown"

    def test_empty_genres(self) -> None:
        client = _make_client()
        data = {"books": [_book_row(genres=[])]}
        detail = client._parse_book_detail(data)
        assert detail is not None
        assert detail.genres == []


# ── TestSearchBooks ───────────────────────────────────────────────────────────


class TestSearchBooks:
    @pytest.mark.asyncio
    async def test_returns_results_from_api(self) -> None:
        client = _make_client()
        api_data = {"search": {"results": {"hits": [_search_hit()]}}}

        with (
            patch("app.services.hardcover.get_redis", return_value=_redis_mock()),
            patch.object(client, "_graphql", new=AsyncMock(return_value=api_data)),
        ):
            results = await client.search_books("dom casmurro")

        assert len(results) == 1
        assert isinstance(results[0], BookResult)

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached(self) -> None:
        client = _make_client()
        cached_data = [
            BookResult(
                book_id="1",
                title="Dom Casmurro",
                author="Machado de Assis",
                cover_url=None,
                slug="dom-casmurro",
                description=None,
                page_count=256,
            ).model_dump()
        ]
        redis_mock = _redis_mock(cached=orjson.dumps(cached_data))

        with (
            patch("app.services.hardcover.get_redis", return_value=redis_mock),
            patch.object(client, "_graphql", new=AsyncMock()) as mock_graphql,
        ):
            results = await client.search_books("dom casmurro")
            mock_graphql.assert_not_called()

        assert len(results) == 1
        assert results[0].title == "Dom Casmurro"

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self) -> None:
        client = _make_client()
        results = await client.search_books("")
        assert results == []

    @pytest.mark.asyncio
    async def test_graphql_returns_none_returns_empty(self) -> None:
        client = _make_client()
        with (
            patch("app.services.hardcover.get_redis", return_value=_redis_mock()),
            patch.object(client, "_graphql", new=AsyncMock(return_value=None)),
        ):
            results = await client.search_books("algo")
        assert results == []

    @pytest.mark.asyncio
    async def test_http_exception_returns_empty(self) -> None:
        client = _make_client()
        client._http_client.post = AsyncMock(side_effect=httpx.RequestError("timeout"))
        with patch("app.services.hardcover.get_redis", return_value=_redis_mock()):
            results = await client.search_books("algo")
        assert results == []

    @pytest.mark.asyncio
    async def test_redis_failure_does_not_block_result(self) -> None:
        client = _make_client()
        api_data = {"search": {"results": {"hits": [_search_hit()]}}}
        bad_redis = AsyncMock()
        bad_redis.get = AsyncMock(side_effect=ConnectionError("redis down"))
        bad_redis.set = AsyncMock(side_effect=ConnectionError("redis down"))

        with (
            patch("app.services.hardcover.get_redis", return_value=bad_redis),
            patch.object(client, "_graphql", new=AsyncMock(return_value=api_data)),
        ):
            results = await client.search_books("dom casmurro")

        assert len(results) == 1


# ── TestGetBook ───────────────────────────────────────────────────────────────


class TestGetBook:
    @pytest.mark.asyncio
    async def test_returns_book_detail_from_api(self) -> None:
        client = _make_client()
        api_data = {"books": [_book_row(genres=["Romance"])]}

        with (
            patch("app.services.hardcover.get_redis", return_value=_redis_mock()),
            patch.object(client, "_graphql", new=AsyncMock(return_value=api_data)),
        ):
            detail = await client.get_book("dom-casmurro")

        assert detail is not None
        assert isinstance(detail, BookDetail)
        assert detail.genres == ["Romance"]

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached(self) -> None:
        client = _make_client()
        cached_book = BookDetail(
            book_id="1",
            title="Dom Casmurro",
            author="Machado de Assis",
            cover_url=None,
            slug="dom-casmurro",
            description=None,
            page_count=256,
            genres=["Romance"],
        )
        redis_mock = _redis_mock(cached=orjson.dumps(cached_book.model_dump()))

        with (
            patch("app.services.hardcover.get_redis", return_value=redis_mock),
            patch.object(client, "_graphql", new=AsyncMock()) as mock_graphql,
        ):
            detail = await client.get_book("dom-casmurro")
            mock_graphql.assert_not_called()

        assert detail is not None
        assert detail.genres == ["Romance"]

    @pytest.mark.asyncio
    async def test_not_found_returns_none(self) -> None:
        client = _make_client()
        with (
            patch("app.services.hardcover.get_redis", return_value=_redis_mock()),
            patch.object(client, "_graphql", new=AsyncMock(return_value={"books": []})),
        ):
            detail = await client.get_book("slug-inexistente")
        assert detail is None

    @pytest.mark.asyncio
    async def test_http_error_returns_none(self) -> None:
        client = _make_client()
        with (
            patch("app.services.hardcover.get_redis", return_value=_redis_mock()),
            patch.object(client, "_graphql", new=AsyncMock(return_value=None)),
        ):
            detail = await client.get_book("dom-casmurro")
        assert detail is None

    @pytest.mark.asyncio
    async def test_empty_slug_returns_none(self) -> None:
        client = _make_client()
        detail = await client.get_book("")
        assert detail is None
