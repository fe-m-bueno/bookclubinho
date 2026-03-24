"""Testes para BodySizeLimitMiddleware."""

from __future__ import annotations

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.security.body_limit import _DEFAULT_LIMIT_BYTES, BodySizeLimitMiddleware


def _app() -> Starlette:
    async def handler(request: Request) -> JSONResponse:
        return JSONResponse({"ok": True})

    app = Starlette(
        routes=[
            Route("/api/v1/messages", handler, methods=["POST"]),
            Route("/api/v1/groups/123/media/upload", handler, methods=["POST"]),
            Route("/api/v1/users/me/avatar", handler, methods=["POST"]),
        ]
    )
    app.add_middleware(BodySizeLimitMiddleware)
    return app


class TestBodySizeLimitMiddleware:
    def test_small_request_passes(self) -> None:
        client = TestClient(_app())
        resp = client.post(
            "/api/v1/messages",
            json={"text": "hi"},
            headers={"Content-Length": "20"},
        )
        assert resp.status_code == 200

    def test_over_limit_returns_413(self) -> None:
        client = TestClient(_app(), raise_server_exceptions=False)
        large_size = _DEFAULT_LIMIT_BYTES + 1
        resp = client.post(
            "/api/v1/messages",
            content=b"x",
            headers={"Content-Length": str(large_size)},
        )
        assert resp.status_code == 413
        assert "grande" in resp.json()["detail"]

    def test_upload_path_allows_larger_payload(self) -> None:
        """Rotas de upload aceitam payloads maiores que 1 MB."""
        client = TestClient(_app())
        # 5 MB — acima do default mas abaixo do limite de upload
        size_5mb = 5 * 1024 * 1024
        resp = client.post(
            "/api/v1/groups/123/media/upload",
            content=b"x",
            headers={"Content-Length": str(size_5mb)},
        )
        assert resp.status_code == 200

    def test_invalid_content_length_returns_400(self) -> None:
        client = TestClient(_app(), raise_server_exceptions=False)
        resp = client.post(
            "/api/v1/messages",
            content=b"x",
            headers={"Content-Length": "not-a-number"},
        )
        assert resp.status_code == 400

    def test_no_content_length_passes(self) -> None:
        """Requisições sem Content-Length devem passar (streaming validation)."""
        client = TestClient(_app())
        resp = client.post("/api/v1/messages", json={"text": "hello"})
        assert resp.status_code == 200
