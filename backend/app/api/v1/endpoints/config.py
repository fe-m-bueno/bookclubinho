"""Endpoints de configuração pública da aplicação."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response  # noqa: TC002

from app.core.genres_config import GENRES

router = APIRouter(tags=["config"])


@router.get("/config/genres", summary="Lista de gêneros literários")
async def list_genres(response: Response) -> dict:
    """Retorna a lista de gêneros literários disponíveis para seleção de preferências."""
    response.headers["Cache-Control"] = "public, max-age=86400"
    return {"genres": [g.model_dump() for g in GENRES]}
