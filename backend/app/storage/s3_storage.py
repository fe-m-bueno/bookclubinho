"""
S3-compatible storage layer — works with MinIO (dev) and Cloudflare R2 (prod).

Public surface:
    upload_file(bucket_path, data, content_type) -> str
    delete_file(bucket_path) -> None
    generate_presigned_upload_url(bucket_path, content_type, expires) -> str

All image uploads are validated by magic bytes, stripped of EXIF, converted to
WebP, and resized before hitting the bucket.  Non-image content types are
forwarded as-is (reserved for future use).

Sizing rules (longest side, aspect ratio preserved):
    avatars/…   → 256 px  (square-cropped to centre)
    groups/…    → 512 px  (square-cropped to centre)
    media/…     → 1200 px (no crop, just downscale if larger)
"""

from __future__ import annotations

import io
import struct
from typing import Final

import boto3
from boto3 import Session as BotoSession
from botocore.config import Config
from PIL import Image, ImageOps

from app.core.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

WEBP_QUALITY: Final = 85          # good balance of quality vs. file size
WEBP_CONTENT_TYPE: Final = "image/webp"

# (max_longest_side, square_crop)
_RESIZE_RULES: Final[dict[str, tuple[int, bool]]] = {
    "avatars/": (256, True),
    "groups/":  (512, True),
    "media/":   (1200, False),
}

# Magic-byte signatures → human label (for error messages only)
_MAGIC: Final[list[tuple[bytes, str]]] = [
    (b"\xff\xd8\xff", "jpeg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    # WebP: "RIFF????WEBP"  (bytes 0-3 and 8-11)
]

_WEBP_RIFF: Final = b"RIFF"
_WEBP_MARKER: Final = b"WEBP"


# ── Boto3 client factory ──────────────────────────────────────────────────────

def _client() -> "boto3.client":  # type: ignore[name-defined]
    """
    Return a new boto3 S3 client configured for R2 or MinIO.

    A new client is created per call (lightweight, thread-safe).
    For hot paths that upload many files concurrently, consider a module-level
    cached client, but that adds complexity with credential rotation.
    """
    return BotoSession().client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            # Path-style required by MinIO; R2 also honours it
            s3={"addressing_style": "path"},
        ),
    )


# ── Image validation ──────────────────────────────────────────────────────────

def _is_image_content_type(content_type: str) -> bool:
    return content_type.startswith("image/")


def _validate_magic_bytes(data: bytes) -> None:
    """
    Reject data whose first bytes don't match a known image format.
    Prevents MIME-type spoofing (e.g. an .exe renamed to .jpg).
    """
    # WebP check: bytes 0-3 == "RIFF", bytes 8-11 == "WEBP"
    if len(data) >= 12 and data[:4] == _WEBP_RIFF and data[8:12] == _WEBP_MARKER:
        return

    for magic, _ in _MAGIC:
        if data[: len(magic)] == magic:
            return

    raise ValueError("Arquivo não reconhecido como imagem válida.")


# ── Image processing ──────────────────────────────────────────────────────────

def _resize_rule(bucket_path: str) -> tuple[int, bool]:
    """Return (max_px, square_crop) for a given bucket path prefix."""
    for prefix, rule in _RESIZE_RULES.items():
        if bucket_path.startswith(prefix):
            return rule
    # Fallback for unknown prefixes — downscale only, no crop
    return (1200, False)


def _process_image(data: bytes, bucket_path: str) -> bytes:
    """
    Validate → open → strip EXIF → resize → re-encode as WebP.
    Returns the processed bytes.
    """
    _validate_magic_bytes(data)

    max_px, square_crop = _resize_rule(bucket_path)

    with Image.open(io.BytesIO(data)) as img:
        # Honour EXIF orientation before stripping (ImageOps.exif_transpose is safe)
        img = ImageOps.exif_transpose(img)

        # Convert palette/RGBA/etc. to RGB for WebP compatibility
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        if square_crop:
            # Centre-crop to a square before resizing
            img = ImageOps.fit(img, (max_px, max_px), method=Image.LANCZOS)
        else:
            # Downscale only — never upscale
            if img.width > max_px or img.height > max_px:
                img.thumbnail((max_px, max_px), Image.LANCZOS)

        # Re-encode as WebP (implicitly strips all metadata)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
        return buf.getvalue()


# ── Public API ────────────────────────────────────────────────────────────────

_bucket_ensured: bool = False


def _ensure_bucket() -> None:
    """Create the bucket if it doesn't exist (idempotent, useful for local MinIO)."""
    global _bucket_ensured
    if _bucket_ensured:
        return
    client = _client()
    try:
        client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
    except client.exceptions.ClientError:
        client.create_bucket(Bucket=settings.S3_BUCKET_NAME)
    _bucket_ensured = True


def upload_file(bucket_path: str, data: bytes, content_type: str) -> str:
    """
    Process (if image) and upload *data* to *bucket_path* in the configured bucket.

    Returns the public URL: ``{S3_PUBLIC_URL}/{bucket_path}``

    This is a synchronous, blocking call.  Wrap with ``asyncio.to_thread()``
    when calling from async FastAPI route handlers.
    """
    if _is_image_content_type(content_type):
        data = _process_image(data, bucket_path)
        content_type = WEBP_CONTENT_TYPE

    _ensure_bucket()
    _client().put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=bucket_path,
        Body=data,
        ContentType=content_type,
    )

    return f"{settings.S3_PUBLIC_URL.rstrip('/')}/{bucket_path}"


def delete_file(bucket_path: str) -> None:
    """
    Delete *bucket_path* from the configured bucket.

    No-op if the object does not exist (R2 and S3 both return 204 in that case).
    Wrap with ``asyncio.to_thread()`` when calling from async route handlers.
    """
    _client().delete_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=bucket_path,
    )


def generate_presigned_upload_url(
    bucket_path: str,
    content_type: str,
    expires: int = 3600,
) -> str:
    """
    Generate a presigned PUT URL so the frontend can upload directly to storage,
    bypassing the backend for large files.

    The frontend must:
      1. GET this URL from the API.
      2. PUT the file to it with the exact ``Content-Type`` header returned here.

    Notes
    -----
    - Presigned PUT URLs are generated with ``put_object``, **not** ``get_object``.
    - R2 requires the bucket to allow presigned URL access (default: enabled).
    - For image paths, the caller is responsible for client-side validation;
      the actual re-encoding happens only when the backend processes the file
      *after* the upload (e.g. in a background job triggered by a webhook).
    """
    url: str = _client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET_NAME,
            "Key": bucket_path,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
        HttpMethod="PUT",
    )
    return url
