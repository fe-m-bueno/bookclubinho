"""Testes de endpoint para upload de mídia — /api/v1/groups/{group_id}/media/upload."""

from __future__ import annotations

import io
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1.endpoints.media import router as media_router
from app.core.deps import get_current_active_user, get_group_membership, get_session
from app.services.media import MediaError
from tests.conftest import make_user

FAKE_GROUP_ID = uuid.uuid4()
FAKE_USER = make_user()
FAKE_DB = AsyncMock()
FAKE_MEMBER = MagicMock()
FAKE_MEMBER.user_id = FAKE_USER.id
FAKE_MEMBER.group_id = FAKE_GROUP_ID

_FAKE_RESULT = {
    "media_url": "https://cdn.example.com/media/g/f.webp",
    "thumbnail_url": "https://cdn.example.com/media/g/f_thumb.webp",
    "width": 100,
    "height": 100,
}


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(
        media_router,
        prefix="/api/v1/groups/{group_id}/media/upload",
    )
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    app.dependency_overrides[get_group_membership] = lambda: FAKE_MEMBER
    return app


def _jpeg_file() -> bytes:
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_upload_returns_201() -> None:
    app = _make_app()
    client = TestClient(app)

    with patch(
        "app.api.v1.endpoints.media.upload_chat_media",
        new=AsyncMock(return_value=_FAKE_RESULT),
    ):
        resp = client.post(
            f"/api/v1/groups/{FAKE_GROUP_ID}/media/upload",
            files={"file": ("photo.jpg", _jpeg_file(), "image/jpeg")},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["media_url"] == _FAKE_RESULT["media_url"]
    assert body["thumbnail_url"] == _FAKE_RESULT["thumbnail_url"]


def test_upload_too_large_returns_413() -> None:
    app = _make_app()
    client = TestClient(app)

    with patch(
        "app.api.v1.endpoints.media.upload_chat_media",
        new=AsyncMock(side_effect=MediaError("Arquivo muito grande.", status_code=413)),
    ):
        resp = client.post(
            f"/api/v1/groups/{FAKE_GROUP_ID}/media/upload",
            files={"file": ("big.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg")},
        )

    assert resp.status_code == 413


def test_upload_unsupported_returns_415() -> None:
    app = _make_app()
    client = TestClient(app)

    with patch(
        "app.api.v1.endpoints.media.upload_chat_media",
        new=AsyncMock(side_effect=MediaError("Tipo não suportado.", status_code=415)),
    ):
        resp = client.post(
            f"/api/v1/groups/{FAKE_GROUP_ID}/media/upload",
            files={"file": ("video.mp4", b"data", "video/mp4")},
        )

    assert resp.status_code == 415


def test_upload_invalid_returns_400() -> None:
    app = _make_app()
    client = TestClient(app)

    with patch(
        "app.api.v1.endpoints.media.upload_chat_media",
        new=AsyncMock(side_effect=MediaError("Arquivo não reconhecido como imagem válida.", status_code=400)),
    ):
        resp = client.post(
            f"/api/v1/groups/{FAKE_GROUP_ID}/media/upload",
            files={"file": ("bad.jpg", b"\x00\x01\x02\x03", "image/jpeg")},
        )

    assert resp.status_code == 400
