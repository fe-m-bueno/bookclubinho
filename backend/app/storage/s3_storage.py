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

import functools
import io
import json
from typing import Final

import boto3
from boto3 import Session as BotoSession
from botocore.config import Config
from PIL import Image, ImageOps

from app.core.config import settings

# ── Constants ─────────────────────────────────────────────────────────────────

WEBP_QUALITY: Final = 85          # good balance of quality vs. file size
WEBP_CONTENT_TYPE: Final = "image/webp"
GIF_CONTENT_TYPE: Final = "image/gif"

_THUMBNAIL_MAX_PX: Final = 300

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

@functools.lru_cache(maxsize=1)
def _client() -> boto3.client:  # type: ignore[name-defined]
    """Return a cached boto3 S3 client configured for R2 or MinIO."""
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


# ── Thumbnail helpers ─────────────────────────────────────────────────────────


def _is_gif(data: bytes) -> bool:
    """Return True if the data starts with a GIF magic header."""
    return data[:6] in (b"GIF87a", b"GIF89a")


def _thumbnail_to_webp(img: Image.Image, max_px: int) -> tuple[bytes, int, int]:
    """Encode an already-opened PIL Image as a WebP thumbnail.

    Applies EXIF transpose, converts to RGB if needed, resizes to max_px
    (longest side, never upscales), and saves as WebP.

    Returns (webp_bytes, original_width, original_height) — the source image
    dimensions *before* the thumbnail resize, so callers can report the full
    media size to clients.
    """
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    orig_w, orig_h = img.size
    img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue(), orig_w, orig_h


def _generate_thumbnail(data: bytes, max_px: int = _THUMBNAIL_MAX_PX) -> tuple[bytes, int, int]:
    """Generate a WebP thumbnail from image bytes (JPEG/PNG/WebP).

    Returns (webp_bytes, original_width, original_height).
    """
    with Image.open(io.BytesIO(data)) as img:
        return _thumbnail_to_webp(img, max_px)


def _generate_gif_thumbnail(data: bytes, max_px: int = _THUMBNAIL_MAX_PX) -> tuple[bytes, int, int]:
    """Generate a static WebP thumbnail from the first frame of a GIF.

    Returns (webp_bytes, original_width, original_height).
    """
    with Image.open(io.BytesIO(data)) as img:
        img.seek(0)  # first frame
        frame = img.copy()
    return _thumbnail_to_webp(frame, max_px)


def process_media_upload(data: bytes, group_id: str, file_uuid: str) -> dict:
    """Validate, process, and upload a media file to the chat media bucket.

    This is a **synchronous** function — call via ``asyncio.to_thread()``.
    Size validation is the caller's responsibility (see upload_chat_media).

    Returns a dict with keys: media_url, thumbnail_url, width, height.
    Raises ValueError for invalid magic bytes.
    """
    _validate_magic_bytes(data)
    _ensure_bucket()

    if _is_gif(data):
        bucket_path = f"media/{group_id}/{file_uuid}.gif"
        thumb_path = f"media/{group_id}/{file_uuid}_thumb.webp"

        # _generate_gif_thumbnail opens the image once and returns original dims
        thumb_bytes, width, height = _generate_gif_thumbnail(data)

        # Upload original GIF (preserves animation)
        _client().put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=bucket_path,
            Body=data,
            ContentType=GIF_CONTENT_TYPE,
        )
    else:
        bucket_path = f"media/{group_id}/{file_uuid}.webp"
        thumb_path = f"media/{group_id}/{file_uuid}_thumb.webp"

        processed = _process_image(data, bucket_path)

        # _generate_thumbnail opens processed once and returns its original dims
        thumb_bytes, width, height = _generate_thumbnail(processed)

        # Upload processed WebP
        _client().put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=bucket_path,
            Body=processed,
            ContentType=WEBP_CONTENT_TYPE,
        )

    # Upload thumbnail (shared by both branches)
    _client().put_object(
        Bucket=settings.S3_BUCKET_NAME,
        Key=thumb_path,
        Body=thumb_bytes,
        ContentType=WEBP_CONTENT_TYPE,
    )

    return {
        "media_url": get_public_url(bucket_path),
        "thumbnail_url": get_public_url(thumb_path),
        "width": width,
        "height": height,
    }


# ── Public API ────────────────────────────────────────────────────────────────

_bucket_ensured: bool = False


def _ensure_bucket() -> None:
    """Create the bucket if it doesn't exist and set public-read policy.

    Idempotent — runs once per process.  In dev (MinIO) the bucket is created
    with an anonymous-read policy so ``get_public_url`` URLs work in the
    browser.  R2 buckets in prod are configured via dashboard/Terraform.
    """
    global _bucket_ensured
    if _bucket_ensured:
        return
    client = _client()
    bucket = settings.S3_BUCKET_NAME
    try:
        client.head_bucket(Bucket=bucket)
    except client.exceptions.ClientError:
        client.create_bucket(Bucket=bucket)

    # Allow anonymous reads so public URLs resolve without presigning.
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": "*",
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/*"],
        }],
    })
    client.put_bucket_policy(Bucket=bucket, Policy=policy)
    _bucket_ensured = True


def get_public_url(bucket_path: str) -> str:
    """Return the public URL for a given bucket path."""
    return f"{settings.S3_PUBLIC_URL.rstrip('/')}/{bucket_path}"


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

    return get_public_url(bucket_path)


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
