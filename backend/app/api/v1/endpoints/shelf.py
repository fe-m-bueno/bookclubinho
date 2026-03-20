"""
Shelf endpoints.

shelf_group_router — montado em /groups/{group_id}/shelf
  GET /                        — estante do grupo (requer autenticação)

shelf_public_router — montado em /shelf
  GET /{invite_code}           — estante pública (sem autenticação, via cache Redis)
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Request, status

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.schemas.shelf import ShelfBookResponse, ShelfResponse
from app.security.rate_limit import limiter
from app.services.shelf import ShelfError, get_group_shelf, get_public_shelf

shelf_group_router = APIRouter(tags=["shelf"])
shelf_public_router = APIRouter(tags=["shelf"])


def _build_shelf_response(data: dict) -> ShelfResponse:
    books = [
        ShelfBookResponse(
            book_title=b["book_title"],
            book_author=b.get("book_author"),
            book_cover_url=b.get("book_cover_url"),
            page_count=b.get("page_count"),
            genres=b.get("genres") or [],
            average_rating=b.get("average_rating"),
            review_count=b.get("review_count", 0),
            started_at=b.get("started_at"),
            finished_at=b.get("finished_at"),
            top_oneliners=b.get("top_oneliners") or [],
        )
        for b in data.get("books", [])
    ]
    return ShelfResponse(
        group_name=data["group_name"],
        group_photo_url=data.get("group_photo_url"),
        books=books,
    )


@shelf_group_router.get(
    "",
    response_model=ShelfResponse,
    summary="Estante do grupo",
)
@limiter.limit("15/minute")
async def group_shelf_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> ShelfResponse:
    """Retorna os livros lidos pelo grupo (rounds finalizados). Atualiza cache público."""
    try:
        data = await get_group_shelf(db, group_id=group_id)
    except ShelfError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _build_shelf_response(data)


@shelf_public_router.get(
    "/{group_id}",
    response_model=ShelfResponse,
    summary="Estante pública do grupo",
)
@limiter.limit("10/minute")
async def public_shelf_endpoint(
    request: Request,
    group_id: uuid.UUID,
) -> ShelfResponse:
    """Retorna a estante pública do grupo via cache Redis (sem autenticação).

    Retorna 404 se o grupo não existe ou ainda não tem livros finalizados.
    """
    data = await get_public_shelf(group_id)
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estante não encontrada. O grupo pode não ter livros finalizados ainda.",
        )

    return _build_shelf_response(data)
