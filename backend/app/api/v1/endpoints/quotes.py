"""
Hall of Quotes endpoints.

quotes_group_router — montado em /groups/{group_id}/quotes
  GET /                        — listar quotes (paginado, sort=votes|recent)
  POST /                       — adicionar quote

quotes_router — montado em /quotes
  POST /{quote_id}/vote        — votar/desvotar quote
  DELETE /{quote_id}           — remover própria quote
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.schemas.quote import QuoteCreateRequest, QuoteListResponse, QuoteResponse
from app.security.rate_limit import limiter
from app.services.quote import QuoteError, create_quote, delete_quote, list_quotes, toggle_vote

quotes_group_router = APIRouter(tags=["quotes"])
quotes_router = APIRouter(tags=["quotes"])


@quotes_group_router.get(
    "",
    response_model=QuoteListResponse,
    summary="Listar quotes do grupo",
)
@limiter.limit("30/minute")
async def list_quotes_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
    sort: str = Query(default="votes", pattern="^(votes|recent)$"),
    round_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> QuoteListResponse:
    """Lista as quotes do grupo com paginação. sort=votes ou recent."""
    quotes_data, next_cursor = await list_quotes(
        db,
        group_id=group_id,
        user_id=current_user.id,
        sort=sort,
        round_id=round_id,
        cursor=cursor,
        limit=limit,
    )

    return QuoteListResponse(
        quotes=[QuoteResponse(**q) for q in quotes_data],
        next_cursor=next_cursor,
    )


@quotes_group_router.post(
    "",
    response_model=QuoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Adicionar quote",
)
@limiter.limit("10/minute")
async def create_quote_endpoint(
    request: Request,
    group_id: uuid.UUID,
    body: QuoteCreateRequest,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> QuoteResponse:
    """Adiciona uma quote ao Hall of Quotes do grupo."""
    round_id = uuid.UUID(body.round_id) if body.round_id else None

    try:
        quote = await create_quote(
            db,
            group_id=group_id,
            user_id=current_user.id,
            quote_text=body.quote_text,
            page_reference=body.page_reference,
            round_id=round_id,
        )
    except QuoteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return QuoteResponse(
        id=str(quote.id),
        user_id=str(quote.user_id),
        username=None,
        display_name=None,
        avatar_url=None,
        quote_text=quote.quote_text,
        page_reference=quote.page_reference,
        book_title=quote.book_title,
        book_author=quote.book_author,
        round_id=str(quote.round_id) if quote.round_id else None,
        vote_count=0,
        did_i_vote=False,
        created_at=quote.created_at,
    )


@quotes_router.post(
    "/{quote_id}/vote",
    summary="Votar/desvotar quote",
)
@limiter.limit("30/minute")
async def toggle_vote_endpoint(
    request: Request,
    quote_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> dict[str, bool]:
    """Adiciona ou remove voto em uma quote. Retorna se o voto foi adicionado."""
    try:
        voted = await toggle_vote(db, quote_id=quote_id, user_id=current_user.id)
    except QuoteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return {"voted": voted}


@quotes_router.delete(
    "/{quote_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover quote",
)
@limiter.limit("10/minute")
async def delete_quote_endpoint(
    request: Request,
    quote_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    """Remove uma quote. Apenas o autor pode remover."""
    try:
        await delete_quote(db, quote_id=quote_id, user_id=current_user.id)
    except QuoteError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)
