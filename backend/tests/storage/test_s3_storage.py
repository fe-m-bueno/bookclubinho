"""Testes unitários para app.storage.s3_storage — thumbnails e process_media_upload."""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.storage.s3_storage import (
    _generate_gif_thumbnail,
    _generate_thumbnail,
    _is_gif,
    _thumbnail_to_webp,
    process_media_upload,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_jpeg_bytes(width: int = 100, height: int = 100) -> bytes:
    img = Image.new("RGB", (width, height), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_gif_bytes(width: int = 100, height: int = 100) -> bytes:
    img = Image.new("P", (width, height), color=0)
    buf = io.BytesIO()
    img.save(buf, format="GIF")
    return buf.getvalue()



# ── _is_gif ───────────────────────────────────────────────────────────────────


def test_is_gif_gif89a() -> None:
    assert _is_gif(b"GIF89a\x00\x00") is True


def test_is_gif_gif87a() -> None:
    assert _is_gif(b"GIF87a\x00\x00") is True


def test_is_gif_jpeg_returns_false() -> None:
    assert _is_gif(b"\xff\xd8\xff\xe0") is False


# ── _generate_thumbnail ───────────────────────────────────────────────────────


def test_thumbnail_to_webp_returns_original_dimensions() -> None:
    """_thumbnail_to_webp must return source dims, not thumbnail dims."""
    img = Image.new("RGB", (800, 600))
    webp_bytes, orig_w, orig_h = _thumbnail_to_webp(img, max_px=300)
    assert orig_w == 800
    assert orig_h == 600
    # Confirm the actual thumbnail is smaller
    thumb = Image.open(io.BytesIO(webp_bytes))
    assert thumb.width <= 300
    assert thumb.height <= 300


def test_generate_thumbnail_resizes_to_300px() -> None:
    large_jpeg = _make_jpeg_bytes(2000, 1500)
    thumb_bytes, orig_w, orig_h = _generate_thumbnail(large_jpeg, max_px=300)
    # Returns original (pre-thumbnail) dimensions
    assert orig_w == 2000
    assert orig_h == 1500
    assert len(thumb_bytes) > 0
    # Confirm output is WebP and smaller than 300px
    img = Image.open(io.BytesIO(thumb_bytes))
    assert img.format == "WEBP"
    assert img.width <= 300
    assert img.height <= 300


def test_generate_thumbnail_small_image_not_upscaled() -> None:
    small_jpeg = _make_jpeg_bytes(50, 50)
    thumb_bytes, orig_w, orig_h = _generate_thumbnail(small_jpeg, max_px=300)
    assert orig_w == 50
    assert orig_h == 50
    # The actual WebP thumbnail is also not upscaled
    thumb = Image.open(io.BytesIO(thumb_bytes))
    assert thumb.width <= 50
    assert thumb.height <= 50


# ── _generate_gif_thumbnail ───────────────────────────────────────────────────


def test_generate_gif_thumbnail_extracts_first_frame() -> None:
    gif_bytes = _make_gif_bytes(200, 200)
    thumb_bytes, orig_w, orig_h = _generate_gif_thumbnail(gif_bytes, max_px=300)
    assert len(thumb_bytes) > 0
    # Returns original GIF dimensions
    assert orig_w == 200
    assert orig_h == 200
    img = Image.open(io.BytesIO(thumb_bytes))
    assert img.format == "WEBP"


# ── process_media_upload ──────────────────────────────────────────────────────


def _make_mock_client() -> MagicMock:
    client = MagicMock()
    client.put_object = MagicMock()
    return client


def test_process_media_upload_jpeg_produces_webp_and_thumb() -> None:
    jpeg_bytes = _make_jpeg_bytes(500, 400)
    mock_client = _make_mock_client()

    with (
        patch("app.storage.s3_storage._client", return_value=mock_client),
        patch("app.storage.s3_storage._ensure_bucket"),
        patch("app.storage.s3_storage.settings") as mock_settings,
    ):
        mock_settings.S3_BUCKET_NAME = "test-bucket"
        mock_settings.S3_PUBLIC_URL = "https://cdn.example.com"
        result = process_media_upload(jpeg_bytes, "group-123", "file-uuid-1")

    assert mock_client.put_object.call_count == 2
    keys_uploaded = {call.kwargs["Key"] for call in mock_client.put_object.call_args_list}
    assert any(k.endswith(".webp") and "_thumb" not in k for k in keys_uploaded)
    assert any("_thumb.webp" in k for k in keys_uploaded)
    assert result["media_url"].endswith(".webp")
    assert result["thumbnail_url"].endswith("_thumb.webp")
    assert result["width"] > 0
    assert result["height"] > 0


def test_process_media_upload_gif_preserves_original() -> None:
    gif_bytes = _make_gif_bytes(150, 150)
    mock_client = _make_mock_client()

    with (
        patch("app.storage.s3_storage._client", return_value=mock_client),
        patch("app.storage.s3_storage._ensure_bucket"),
        patch("app.storage.s3_storage.settings") as mock_settings,
    ):
        mock_settings.S3_BUCKET_NAME = "test-bucket"
        mock_settings.S3_PUBLIC_URL = "https://cdn.example.com"
        result = process_media_upload(gif_bytes, "group-123", "file-uuid-2")

    assert mock_client.put_object.call_count == 2
    content_types = [call.kwargs["ContentType"] for call in mock_client.put_object.call_args_list]
    assert "image/gif" in content_types
    assert "image/webp" in content_types
    assert result["media_url"].endswith(".gif")
    assert result["thumbnail_url"].endswith("_thumb.webp")


def test_process_media_upload_rejects_invalid_magic_bytes() -> None:
    invalid_bytes = b"\x00\x01\x02\x03" * 100

    with pytest.raises(ValueError, match="imagem válida"):
        process_media_upload(invalid_bytes, "group-123", "file-uuid-3")


