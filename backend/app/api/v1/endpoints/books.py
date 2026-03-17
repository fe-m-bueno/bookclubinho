"""
GET /api/v1/books/search  — busca livros via Hardcover API
GET /api/v1/books/{slug}  — detalha um livro por slug
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.deps import CurrentUserID  # noqa: TC001
from app.schemas.hardcover import BookDetail, BookResult
from app.security.rate_limit import limiter
from app.services.hardcover import HardcoverClient, get_hardcover_client

router = APIRouter(tags=["books"])

HardcoverDep = Annotated[HardcoverClient, Depends(get_hardcover_client)]


@router.get(
    "/search",
    response_model=list[BookResult],
    summary="Buscar livros",
)
@limiter.limit("30/minute")
async def search_books(
    request: Request,
    _user_id: CurrentUserID,
    client: HardcoverDep,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[BookResult]:
    """Busca livros por nome, autor ou ISBN via Hardcover API."""
    return await client.search_books(q, limit=limit)


@router.get(
    "/{slug}",
    response_model=BookDetail,
    summary="Detalhar livro por slug",
)
@limiter.limit("60/minute")
async def get_book(
    request: Request,
    slug: str,
    _user_id: CurrentUserID,
    client: HardcoverDep,
) -> BookDetail:
    """Retorna detalhes completos de um livro identificado pelo slug."""
    book = await client.get_book(slug)
    if book is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Livro não encontrado.",
        )
    return book
