"""Testes unitários para app.services.media."""

from __future__ import annotations

import io
import uuid
from unittest.mock import patch

import pytest
from PIL import Image

from app.services.media import MediaError, upload_chat_media


def _make_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (100, 100), color=(0, 128, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


_FAKE_RESULT = {
    "media_url": "https://cdn.example.com/media/g/f.webp",
    "thumbnail_url": "https://cdn.example.com/media/g/f_thumb.webp",
    "width": 100,
    "height": 100,
}


@pytest.mark.asyncio
async def test_upload_chat_media_success() -> None:
    data = _make_jpeg_bytes()
    group_id = uuid.uuid4()

    with patch("app.services.media.process_media_upload", return_value=_FAKE_RESULT):
        result = await upload_chat_media(data, "image/jpeg", group_id)

    assert result["media_url"] == _FAKE_RESULT["media_url"]
    assert result["thumbnail_url"] == _FAKE_RESULT["thumbnail_url"]


@pytest.mark.asyncio
async def test_upload_too_large_raises_413() -> None:
    oversized = b"\xff\xd8\xff" + b"\x00" * (11 * 1024 * 1024)
    group_id = uuid.uuid4()

    with pytest.raises(MediaError) as exc_info:
        await upload_chat_media(oversized, "image/jpeg", group_id)
    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_unsupported_type_raises_415() -> None:
    group_id = uuid.uuid4()

    with pytest.raises(MediaError) as exc_info:
        await upload_chat_media(b"data", "video/mp4", group_id)
    assert exc_info.value.status_code == 415


@pytest.mark.asyncio
async def test_invalid_bytes_raises_400() -> None:
    """process_media_upload raises ValueError → service maps to 400."""
    data = _make_jpeg_bytes()
    group_id = uuid.uuid4()

    with patch(
        "app.services.media.process_media_upload",
        side_effect=ValueError("Arquivo não reconhecido como imagem válida."),
    ), pytest.raises(MediaError) as exc_info:
        await upload_chat_media(data, "image/jpeg", group_id)
    assert exc_info.value.status_code == 400
