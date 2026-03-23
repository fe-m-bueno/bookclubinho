"""
GET /api/v1/link-preview — retorna metadados Open Graph de uma URL.

Requer autenticação. Resultado é cacheado no Redis por 24h.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.core.deps import CurrentUserID  # noqa: TC001
from app.security.rate_limit import limiter
from app.services.link_preview import fetch_link_preview

router = APIRouter(tags=["link-preview"])


class LinkPreviewResponse(BaseModel):
    url: str
    title: str | None
    description: str | None
    image: str | None
    site_name: str | None


@router.get(
    "/link-preview",
    response_model=LinkPreviewResponse,
    summary="Buscar metadados Open Graph de uma URL",
)
@limiter.limit("30/minute")
async def get_link_preview(
    request: Request,
    _user_id: CurrentUserID,
    url: str = Query(..., min_length=10, max_length=2048),
) -> LinkPreviewResponse:
    """Retorna título, descrição, imagem e site_name da URL via tags OG."""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Apenas URLs http/https são aceitas.",
        )

    preview = await fetch_link_preview(url)
    if preview is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não foi possível obter preview para esta URL.",
        )

    return LinkPreviewResponse(**preview.to_dict())
