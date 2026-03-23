"""Link preview service — fetches and caches Open Graph metadata for a URL."""

from __future__ import annotations

import hashlib
import ipaddress
import json
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
import structlog

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

_CACHE_TTL = 86_400  # 24 horas
_CACHE_PREFIX = "og:v1:"
_REQUEST_TIMEOUT = 5.0  # segundos
_MAX_BODY_BYTES = 200_000  # 200 KB — só precisamos do <head>

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


class LinkPreviewData:
    __slots__ = ("url", "title", "description", "image", "site_name")

    def __init__(
        self,
        *,
        url: str,
        title: str | None = None,
        description: str | None = None,
        image: str | None = None,
        site_name: str | None = None,
    ) -> None:
        self.url = url
        self.title = title
        self.description = description
        self.image = image
        self.site_name = site_name

    def to_dict(self) -> dict[str, str | None]:
        return {
            "url": self.url,
            "title": self.title,
            "description": self.description,
            "image": self.image,
            "site_name": self.site_name,
        }


def _is_safe_url(url: str) -> bool:
    """Returns False if the URL resolves to a private/loopback address (SSRF guard)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        # Resolve to IP and check against private ranges
        addr = ipaddress.ip_address(socket.gethostbyname(hostname))
        return not any(addr in net for net in _PRIVATE_NETWORKS)
    except Exception:
        return False


class _OGParser(HTMLParser):
    """Lightweight SAX-style parser that extracts meta OG/Twitter tags and <title>."""

    def __init__(self) -> None:
        super().__init__()
        self.og: dict[str, str] = {}
        self._in_title = False
        self._title_buf: list[str] = []
        self._done = False  # stop after </head>

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._done:
            return
        attr_map = dict(attrs)
        if tag == "title":
            self._in_title = True
            self._title_buf = []
        elif tag == "meta":
            prop = attr_map.get("property") or attr_map.get("name") or ""
            content = attr_map.get("content") or ""
            if not content:
                return
            if prop in {
                "og:title",
                "og:description",
                "og:image",
                "og:site_name",
                "og:url",
            }:
                self.og[prop] = content
            elif prop in {"twitter:title", "twitter:description", "twitter:image"}:
                og_key = prop.replace("twitter:", "og:")
                # Only fill if OG version not already set
                if og_key not in self.og:
                    self.og[og_key] = content

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "head":
            self._done = True

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_buf.append(data)

    @property
    def page_title(self) -> str | None:
        text = "".join(self._title_buf).strip()
        return text or None


async def fetch_link_preview(url: str) -> LinkPreviewData | None:
    """
    Returns OG metadata for *url*, using Redis as a 24-hour cache.
    Returns None on any error (network, parse, SSRF, etc.).
    """
    cache_key = _CACHE_PREFIX + hashlib.sha256(url.encode()).hexdigest()

    # --- cache hit ---
    try:
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            data = json.loads(cached)
            return LinkPreviewData(**data)
    except Exception:
        pass  # redis unavailable — fall through to fetch

    # --- SSRF guard ---
    if not _is_safe_url(url):
        logger.warning("link_preview.blocked_url", url=url)
        return None

    # --- fetch ---
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=_REQUEST_TIMEOUT,
            headers={
                "User-Agent": "Bookclubinho/1.0 (+https://bookclubinho.com)",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            },
        ) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    return None
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    return None
                body = b""
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    body += chunk
                    if len(body) >= _MAX_BODY_BYTES:
                        break
    except Exception as exc:
        logger.info("link_preview.fetch_error", url=url, error=str(exc))
        return None

    # --- parse ---
    try:
        html = body.decode("utf-8", errors="replace")
        parser = _OGParser()
        parser.feed(html)
        og = parser.og

        title = og.get("og:title") or parser.page_title
        description = og.get("og:description")
        image = og.get("og:image")
        site_name = og.get("og:site_name") or urlparse(url).hostname

        preview = LinkPreviewData(
            url=url,
            title=title,
            description=description,
            image=image,
            site_name=site_name,
        )
    except Exception as exc:
        logger.warning("link_preview.parse_error", url=url, error=str(exc))
        return None

    # --- cache store ---
    try:
        redis = get_redis()
        await redis.setex(cache_key, _CACHE_TTL, json.dumps(preview.to_dict()))
    except Exception:
        pass  # redis unavailable — serve uncached

    return preview
