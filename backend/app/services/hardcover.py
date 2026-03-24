"""HardcoverClient — busca de livros via Hardcover GraphQL API com cache Redis."""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any

import httpx
import orjson
import structlog

from app.core.config import settings
from app.core.redis import get_redis
from app.schemas.hardcover import BookDetail, BookResult
from app.security.sanitizer import sanitize

logger = structlog.get_logger(__name__)

_SEARCH_TTL = 3600  # 1 hora
_BOOK_TTL = 86400  # 24 horas

_SEARCH_QUERY = """
query SearchBooks($query: String!, $per_page: Int!) {
  search(query: $query, query_type: "Book", per_page: $per_page) {
    results
  }
}
"""

_BOOK_QUERY = """
query GetBook($slug: String!) {
  books(where: { slug: { _eq: $slug } }) {
    id
    title
    slug
    description
    pages
    image { url }
    contributions { author { name } }
    cached_tags
  }
}
"""


class HardcoverClient:
    def __init__(
        self,
        *,
        api_url: str | None = None,
        api_token: str | None = None,
    ) -> None:
        self._api_url = api_url or settings.HARDCOVER_API_URL
        self._api_token = api_token or settings.HARDCOVER_API_TOKEN
        self._http_client = httpx.AsyncClient()

    async def aclose(self) -> None:
        """Fecha o httpx.AsyncClient — chamar no shutdown da aplicação."""
        await self._http_client.aclose()

    # ── Public API ─────────────────────────────────────────────────────────────

    async def search_books(self, query: str, *, limit: int = 10) -> list[BookResult]:
        """Busca livros por query. Retorna [] em qualquer falha."""
        clean_query = sanitize(query).strip()
        if not clean_query:
            return []

        cache_key = self._cache_key_search(clean_query, limit)
        redis = get_redis()
        try:
            cached = await redis.get(cache_key)
            if cached:
                raw = orjson.loads(cached)
                return [BookResult.model_validate(item) for item in raw]
        except Exception:
            logger.warning("hardcover_search_cache_read_error", query=clean_query)

        data = await self._graphql(_SEARCH_QUERY, {"query": clean_query, "per_page": limit})
        if data is None:
            return []

        results = self._parse_search_results(data)

        try:
            await redis.set(
                cache_key,
                orjson.dumps([r.model_dump() for r in results]),
                ex=_SEARCH_TTL,
            )
        except Exception:
            logger.warning("hardcover_search_cache_write_error", query=clean_query)

        return results

    async def get_book(self, slug: str) -> BookDetail | None:
        """Busca detalhes de um livro por slug. Retorna None em qualquer falha."""
        clean_slug = sanitize(slug).strip()
        if not clean_slug:
            return None

        cache_key = self._cache_key_book(clean_slug)
        redis = get_redis()
        try:
            cached = await redis.get(cache_key)
            if cached:
                return BookDetail.model_validate(orjson.loads(cached))
        except Exception:
            logger.warning("hardcover_book_cache_read_error", slug=clean_slug)

        data = await self._graphql(_BOOK_QUERY, {"slug": clean_slug})
        if data is None:
            return None

        book = self._parse_book_detail(data)
        if book is None:
            return None

        try:
            await redis.set(
                cache_key,
                orjson.dumps(book.model_dump()),
                ex=_BOOK_TTL,
            )
        except Exception:
            logger.warning("hardcover_book_cache_write_error", slug=clean_slug)

        return book

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any] | None:
        try:
            resp = await self._http_client.post(
                self._api_url,
                json={"query": query, "variables": variables},
                headers=self._headers(),
                timeout=10.0,
            )
            if resp.status_code != 200:
                logger.warning("hardcover_graphql_http_error", status=resp.status_code)
                return None
            payload: dict[str, Any] = resp.json()
            if "errors" in payload:
                logger.warning("hardcover_graphql_errors", errors=payload["errors"])
                return None
            return payload.get("data")
        except Exception as exc:
            logger.warning("hardcover_graphql_exception", exc=str(exc))
            return None

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_token}",
        }

    def _cache_key_search(self, query: str, limit: int) -> str:
        digest = hashlib.md5(f"{query.lower()}:{limit}".encode()).hexdigest()  # noqa: S324
        return f"hc:search:{digest}"

    def _cache_key_book(self, slug: str) -> str:
        return f"hc:book:{slug}"

    @staticmethod
    def _extract_author_name(contributions: list[Any]) -> str:
        if contributions:
            name = (contributions[0].get("author") or {}).get("name")
            if name:
                return name
        return "Unknown"

    def _parse_search_results(self, data: dict[str, Any]) -> list[BookResult]:
        results: list[BookResult] = []
        try:
            hits = data.get("search", {}).get("results", {}).get("hits", [])
        except (AttributeError, TypeError):
            hits = []

        for i, hit in enumerate(hits):
            try:
                document = hit.get("document", hit)
                results.append(
                    BookResult(
                        book_id=str(document["id"]),
                        title=document.get("title") or "",
                        author=self._extract_author_name(document.get("contributions") or []),
                        cover_url=(document.get("image") or {}).get("url"),
                        slug=document.get("slug") or "",
                        description=document.get("description"),
                        page_count=document.get("pages"),
                    )
                )
            except Exception:
                logger.warning("hardcover_parse_search_entry_error", index=i)
                continue

        return results

    def _parse_book_detail(self, data: dict[str, Any]) -> BookDetail | None:
        try:
            books = data.get("books") or []
            if not books:
                return None
            book = books[0]
            cached_tags: dict = book.get("cached_tags") or {}
            genres = [entry["tag"] for entry in (cached_tags.get("Genre") or []) if entry.get("tag")]
            return BookDetail(
                book_id=str(book["id"]),
                title=book.get("title") or "",
                author=self._extract_author_name(book.get("contributions") or []),
                cover_url=(book.get("image") or {}).get("url"),
                slug=book.get("slug") or "",
                description=book.get("description"),
                page_count=book.get("pages"),
                genres=genres,
            )
        except Exception as exc:
            logger.warning("hardcover_parse_book_detail_error", exc=str(exc))
            return None


# ── Singleton gerenciado (mesmo padrão de app/core/redis.py) ───────────────────

_hardcover_client: HardcoverClient | None = None


def get_hardcover_client() -> HardcoverClient:
    """Retorna (ou cria) o singleton global de HardcoverClient."""
    global _hardcover_client
    if _hardcover_client is None:
        _hardcover_client = HardcoverClient()
    return _hardcover_client


async def close_hardcover_client() -> None:
    """Fecha o AsyncClient no shutdown da aplicação."""
    global _hardcover_client
    if _hardcover_client is not None:
        await _hardcover_client.aclose()
        _hardcover_client = None


if __name__ == "__main__":

    async def _main() -> None:
        client = HardcoverClient()
        results = await client.search_books("machado de assis")
        print(f"Search results ({len(results)}):")
        for r in results:
            print(f"  [{r.book_id}] {r.title} — {r.author} ({r.slug})")
        if results:
            detail = await client.get_book(results[0].slug)
            if detail:
                print(f"\nDetail: {detail.title}")
                print(f"  Genres: {detail.genres}")
                print(f"  Pages: {detail.page_count}")
            else:
                print("\nDetail not found.")

    asyncio.run(_main())
