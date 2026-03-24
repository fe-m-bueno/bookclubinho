"""Media upload service — valida e persiste mídia de chat no R2/MinIO."""

from __future__ import annotations

import asyncio
import uuid

import structlog

from app.core.exceptions import ServiceError
from app.storage.s3_storage import process_media_upload

logger = structlog.get_logger(__name__)

_MAX_SIZE = 10 * 1024 * 1024  # 10 MB
_ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})


class MediaError(ServiceError):
    """Raised when media validation or upload fails."""


async def upload_chat_media(
    data: bytes,
    content_type: str,
    group_id: uuid.UUID,
) -> dict:
    """Validate and upload chat media to storage.

    Returns dict with: media_url, thumbnail_url, width, height.

    Raises:
        MediaError(413) — file too large
        MediaError(415) — unsupported content type
        MediaError(400) — invalid file bytes
    """
    if len(data) > _MAX_SIZE:
        raise MediaError(
            f"Arquivo excede o limite de {_MAX_SIZE // (1024 * 1024)} MB.",
            status_code=413,
        )

    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise MediaError(
            f"Tipo de arquivo não suportado: {content_type}. Permitidos: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
            status_code=415,
        )

    file_uuid = str(uuid.uuid4())

    try:
        result: dict = await asyncio.to_thread(process_media_upload, data, str(group_id), file_uuid)
    except ValueError as exc:
        raise MediaError(str(exc), status_code=400) from exc

    logger.info(
        "chat_media_uploaded",
        group_id=str(group_id),
        file_uuid=file_uuid,
        content_type=content_type,
    )
    return result
