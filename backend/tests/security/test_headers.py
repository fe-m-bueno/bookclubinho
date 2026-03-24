"""Testes para SecurityHeadersMiddleware."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.security.headers import SecurityHeadersMiddleware


def _simple_app() -> Starlette:
    """Cria uma app Starlette mínima com o middleware de security headers."""

    async def homepage(request: Request) -> JSONResponse:
        return JSONResponse({"ok": True})

    async def protected(request: Request) -> JSONResponse:
        return JSONResponse({"data": "sensitive"})

    app = Starlette(
        routes=[
            Route("/", homepage),
            Route("/api/v1/users/me", protected),
            Route("/api/v1/groups/123", protected),
        ]
    )
    app.add_middleware(SecurityHeadersMiddleware)
    return app


class TestSecurityHeadersMiddleware:
    def test_x_content_type_options_nosniff(self) -> None:
        client = TestClient(_simple_app())
        resp = client.get("/")
        assert resp.headers["x-content-type-options"] == "nosniff"

    def test_x_frame_options_deny(self) -> None:
        client = TestClient(_simple_app())
        resp = client.get("/")
        assert resp.headers["x-frame-options"] == "DENY"

    def test_referrer_policy(self) -> None:
        client = TestClient(_simple_app())
        resp = client.get("/")
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"

    def test_permissions_policy_present(self) -> None:
        client = TestClient(_simple_app())
        resp = client.get("/")
        policy = resp.headers["permissions-policy"]
        assert "camera=()" in policy
        assert "microphone=()" in policy
        assert "geolocation=()" in policy

    def test_xss_protection_disabled(self) -> None:
        """X-XSS-Protection deve ser 0 — CSP é a proteção correta."""
        client = TestClient(_simple_app())
        resp = client.get("/")
        assert resp.headers["x-xss-protection"] == "0"

    def test_hsts_absent_in_debug(self) -> None:
        """HSTS não deve ser adicionado em modo debug (localhost sem HTTPS)."""
        with patch("app.security.headers.settings") as mock_settings:
            mock_settings.DEBUG = True
            client = TestClient(_simple_app())
            resp = client.get("/")
        assert "strict-transport-security" not in resp.headers

    def test_hsts_present_in_prod(self) -> None:
        """HSTS deve ser adicionado em produção."""
        with patch("app.security.headers.settings") as mock_settings:
            mock_settings.DEBUG = False
            mock_settings.ENVIRONMENT = "prod"
            client = TestClient(_simple_app())
            resp = client.get("/")
        assert "strict-transport-security" in resp.headers
        assert "max-age=31536000" in resp.headers["strict-transport-security"]
        assert "includeSubDomains" in resp.headers["strict-transport-security"]

    def test_cache_control_no_store_on_authenticated_routes(self) -> None:
        """Rotas autenticadas devem ter Cache-Control: no-store."""
        client = TestClient(_simple_app())
        resp = client.get("/api/v1/users/me")
        assert "no-store" in resp.headers.get("cache-control", "")

    def test_cache_control_not_forced_on_public_routes(self) -> None:
        """Rotas públicas não devem ter Cache-Control forçado pelo middleware."""
        client = TestClient(_simple_app())
        resp = client.get("/")
        # Pode não ter cache-control, ou ter o padrão do framework
        cc = resp.headers.get("cache-control", "")
        assert "no-store" not in cc
