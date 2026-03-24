"""Testes unitários para o serviço de link preview — sem I/O real."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.link_preview import (
    _is_safe_url,
    _OGParser,
    fetch_link_preview,
)

# ── _is_safe_url ──────────────────────────────────────────────────────────────


class TestIsSafeUrl:
    def test_public_url_is_safe(self) -> None:
        with patch("app.services.link_preview.socket.gethostbyname", return_value="93.184.216.34"):
            assert _is_safe_url("https://example.com") is True

    def test_localhost_is_blocked(self) -> None:
        with patch("app.services.link_preview.socket.gethostbyname", return_value="127.0.0.1"):
            assert _is_safe_url("https://localhost") is False

    def test_private_10_is_blocked(self) -> None:
        with patch("app.services.link_preview.socket.gethostbyname", return_value="10.0.0.1"):
            assert _is_safe_url("https://internal.example.com") is False

    def test_private_192_168_is_blocked(self) -> None:
        with patch("app.services.link_preview.socket.gethostbyname", return_value="192.168.1.1"):
            assert _is_safe_url("https://router.local") is False

    def test_private_172_is_blocked(self) -> None:
        with patch("app.services.link_preview.socket.gethostbyname", return_value="172.16.0.1"):
            assert _is_safe_url("https://internal") is False

    def test_ftp_scheme_is_blocked(self) -> None:
        assert _is_safe_url("ftp://example.com") is False

    def test_javascript_scheme_is_blocked(self) -> None:
        assert _is_safe_url("javascript:alert(1)") is False

    def test_dns_failure_returns_false(self) -> None:
        with patch(
            "app.services.link_preview.socket.gethostbyname",
            side_effect=OSError("no such host"),
        ):
            assert _is_safe_url("https://nxdomain.invalid") is False


# ── _OGParser ─────────────────────────────────────────────────────────────────


class TestOGParser:
    def _parse(self, html: str) -> _OGParser:
        p = _OGParser()
        p.feed(html)
        return p

    def test_og_title(self) -> None:
        p = self._parse('<meta property="og:title" content="Meu Livro">')
        assert p.og["og:title"] == "Meu Livro"

    def test_og_description(self) -> None:
        p = self._parse('<meta property="og:description" content="Uma história incrível.">')
        assert p.og["og:description"] == "Uma história incrível."

    def test_og_image(self) -> None:
        p = self._parse('<meta property="og:image" content="https://img.example.com/cover.jpg">')
        assert p.og["og:image"] == "https://img.example.com/cover.jpg"

    def test_og_site_name(self) -> None:
        p = self._parse('<meta property="og:site_name" content="Bookclubinho">')
        assert p.og["og:site_name"] == "Bookclubinho"

    def test_twitter_falls_back_to_og(self) -> None:
        p = self._parse('<meta name="twitter:title" content="Twitter Title">')
        assert p.og["og:title"] == "Twitter Title"

    def test_og_takes_priority_over_twitter(self) -> None:
        html = (
            '<meta property="og:title" content="OG Title">'
            '<meta name="twitter:title" content="Twitter Title">'
        )
        p = self._parse(html)
        assert p.og["og:title"] == "OG Title"

    def test_page_title_from_title_tag(self) -> None:
        p = self._parse("<title>Página Inicial</title>")
        assert p.page_title == "Página Inicial"

    def test_page_title_returns_none_when_absent(self) -> None:
        p = self._parse("<html><body>no title</body></html>")
        assert p.page_title is None

    def test_stops_parsing_after_head(self) -> None:
        html = (
            "<head><meta property='og:title' content='Head Title'></head>"
            "<body><meta property='og:title' content='Body Title'></body>"
        )
        p = self._parse(html)
        assert p.og["og:title"] == "Head Title"

    def test_ignores_meta_without_content(self) -> None:
        p = self._parse('<meta property="og:title">')
        assert "og:title" not in p.og


# ── fetch_link_preview ────────────────────────────────────────────────────────

_SAMPLE_HTML = (
    b"<html><head>"
    b"<title>Exemplo</title>"
    b'<meta property="og:title" content="Titulo OG">'
    b'<meta property="og:description" content="Descricao da pagina.">'
    b'<meta property="og:image" content="https://example.com/img.png">'
    b'<meta property="og:site_name" content="Exemplo">'
    b"</head><body></body></html>"
)


def _make_mock_stream(body: bytes, status_code: int = 200, content_type: str = "text/html; charset=utf-8") -> MagicMock:
    """Build a mock that behaves like httpx AsyncClient.stream() context manager."""
    chunks = [body[i : i + 4096] for i in range(0, len(body), 4096)] or [b""]

    async def aiter_bytes(chunk_size: int = 4096):  # noqa: ARG001
        for chunk in chunks:
            yield chunk

    response = MagicMock()
    response.status_code = status_code
    response.headers = {"content-type": content_type}
    response.aiter_bytes = aiter_bytes

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=response)
    cm.__aexit__ = AsyncMock(return_value=None)
    return cm


@pytest.mark.asyncio
async def test_fetch_link_preview_returns_data() -> None:
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.setex = AsyncMock()

    with (
        patch("app.services.link_preview.get_redis", return_value=mock_redis),
        patch("app.services.link_preview._is_safe_url", return_value=True),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_client.stream = MagicMock(return_value=_make_mock_stream(_SAMPLE_HTML))

        result = await fetch_link_preview("https://example.com")

    assert result is not None
    assert result.title == "Titulo OG"
    assert result.description == "Descricao da pagina."
    assert result.image == "https://example.com/img.png"
    assert result.site_name == "Exemplo"


@pytest.mark.asyncio
async def test_fetch_link_preview_returns_cached() -> None:
    import json

    cached_data = {
        "url": "https://example.com",
        "title": "Cached Title",
        "description": None,
        "image": None,
        "site_name": "example.com",
    }
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_data))

    with patch("app.services.link_preview.get_redis", return_value=mock_redis):
        result = await fetch_link_preview("https://example.com")

    assert result is not None
    assert result.title == "Cached Title"


@pytest.mark.asyncio
async def test_fetch_link_preview_blocks_ssrf() -> None:
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with (
        patch("app.services.link_preview.get_redis", return_value=mock_redis),
        patch("app.services.link_preview._is_safe_url", return_value=False),
    ):
        result = await fetch_link_preview("https://localhost/secret")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_link_preview_returns_none_on_http_error() -> None:
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with (
        patch("app.services.link_preview.get_redis", return_value=mock_redis),
        patch("app.services.link_preview._is_safe_url", return_value=True),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_client.stream = MagicMock(return_value=_make_mock_stream(b"", status_code=404))

        result = await fetch_link_preview("https://example.com/404")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_link_preview_returns_none_on_non_html() -> None:
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with (
        patch("app.services.link_preview.get_redis", return_value=mock_redis),
        patch("app.services.link_preview._is_safe_url", return_value=True),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_client.stream = MagicMock(
            return_value=_make_mock_stream(b"binary", content_type="application/pdf")
        )

        result = await fetch_link_preview("https://example.com/doc.pdf")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_link_preview_returns_none_on_network_error() -> None:
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    with (
        patch("app.services.link_preview.get_redis", return_value=mock_redis),
        patch("app.services.link_preview._is_safe_url", return_value=True),
        patch("httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_client.stream = MagicMock(side_effect=httpx.ConnectError("refused"))

        result = await fetch_link_preview("https://example.com")

    assert result is None
