"""
Media upload endpoint.

router — montado em /groups/{group_id}/media/upload
  POST ""  — membro faz upload de imagem/GIF para o chat
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.core.deps import CurrentUser, GroupMemberDep  # noqa: TC001
from app.schemas.media import MediaUploadResponse
from app.security.rate_limit import limiter
from app.services.media import MediaError, upload_chat_media

router = APIRouter(tags=["media"])


@router.post(
    "",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload de mídia para o chat",
)
@limiter.limit("5/hour")
async def upload_chat_media_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    file: UploadFile = File(...),  # noqa: B008
) -> MediaUploadResponse:
    """Faz upload de imagem ou GIF para o chat do grupo.

    Valida magic bytes, re-codifica para WebP, gera thumbnail 300px.
    GIFs preservam animação; a thumbnail é um WebP estático do primeiro frame.
    Limite: 10 MB, 5 uploads por hora.
    """
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"

    try:
        result = await upload_chat_media(data, content_type, group_id)
    except MediaError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MediaUploadResponse(**result)
