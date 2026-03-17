"""
Round endpoints.

group_rounds_router — montado em /groups/{group_id}/rounds
  POST /           — admin cria rodada
  GET /            — membro lista rodadas
  GET /current     — membro busca rodada ativa

rounds_router — montado em /rounds
  PATCH /{round_id}  — admin atualiza rodada
  DELETE /{round_id} — admin deleta rodada
"""

from __future__ import annotations

import uuid  # noqa: TC003 — required at runtime for FastAPI path-param resolution

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.deps import (  # noqa: TC001
    CurrentUser,
    DBSession,
    GroupAdminDep,
    GroupMemberDep,
)
from app.db.models.round import Round, RoundNomination  # noqa: TC001
from app.schemas.group import MessageResponse
from app.schemas.round import (
    NominationSummary,
    RoundCreateRequest,
    RoundCreateResponse,
    RoundDetailResponse,
    RoundListItem,
    RoundListResponse,
    RoundUpdateRequest,
)
from app.security.rate_limit import limiter
from app.services.round import (
    RoundError,
    create_round,
    delete_round,
    get_current_round,
    list_rounds,
    update_round,
    verify_round_admin,
)

group_rounds_router = APIRouter(tags=["rounds"])
rounds_router = APIRouter(tags=["rounds"])


def _nomination_to_schema(nomination: RoundNomination) -> NominationSummary:
    return NominationSummary(
        id=str(nomination.id),
        book_id=nomination.book_id,
        book_title=nomination.book_title,
        book_author=nomination.book_author,
        book_cover_url=nomination.book_cover_url,
        book_page_count=nomination.book_page_count,
        pitch=nomination.pitch,
        user_id=str(nomination.user_id),
        nominated_at=nomination.nominated_at,
        vote_count=len(nomination.votes),
    )


def _round_to_detail(round_: Round) -> RoundDetailResponse:
    return RoundDetailResponse(
        id=str(round_.id),
        round_number=round_.round_number,
        book_id=round_.book_id,
        book_title=round_.book_title,
        book_author=round_.book_author,
        book_cover_url=round_.book_cover_url,
        book_page_count=round_.book_page_count,
        status=round_.status,
        deadline=round_.deadline,
        started_at=round_.started_at,
        finished_at=round_.finished_at,
        created_at=round_.created_at,
        nominations=[_nomination_to_schema(n) for n in round_.nominations],
    )


# ── /groups/{group_id}/rounds ─────────────────────────────────────────────────


@group_rounds_router.post(
    "",
    response_model=RoundCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova rodada",
)
@limiter.limit("10/minute")
async def create_new_round(
    request: Request,
    group_id: uuid.UUID,
    body: RoundCreateRequest,
    _admin: GroupAdminDep,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundCreateResponse:
    """Cria uma nova rodada de leitura. Apenas admins."""
    try:
        round_ = await create_round(
            db,
            group_id=group_id,
            user_id=current_user.id,
            deadline=body.deadline,
        )
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RoundCreateResponse(
        id=str(round_.id),
        round_number=round_.round_number,
        status=round_.status,
        deadline=round_.deadline,
        created_at=round_.created_at,
    )


@group_rounds_router.get(
    "",
    response_model=RoundListResponse,
    summary="Listar rodadas do grupo",
)
@limiter.limit("30/minute")
async def list_group_rounds(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    db: DBSession,
    cursor: int | None = Query(default=None, description="round_number cursor"),
    limit: int = Query(default=10, ge=1, le=50),
) -> RoundListResponse:
    """Lista rodadas do grupo com paginação cursor-based."""
    rounds, next_cursor = await list_rounds(db, group_id=group_id, cursor=cursor, limit=limit)

    items = [
        RoundListItem(
            id=str(r.id),
            round_number=r.round_number,
            book_title=r.book_title,
            status=r.status,
            deadline=r.deadline,
            started_at=r.started_at,
            finished_at=r.finished_at,
            created_at=r.created_at,
            nomination_count=len(r.nominations),
        )
        for r in rounds
    ]
    return RoundListResponse(rounds=items, next_cursor=next_cursor)


@group_rounds_router.get(
    "/current",
    response_model=RoundDetailResponse,
    summary="Buscar rodada ativa",
)
@limiter.limit("30/minute")
async def get_active_round(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    db: DBSession,
) -> RoundDetailResponse:
    """Retorna a rodada ativa do grupo (status != finished)."""
    round_ = await get_current_round(db, group_id=group_id)
    if round_ is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma rodada ativa.",
        )
    return _round_to_detail(round_)


# ── /rounds ───────────────────────────────────────────────────────────────────


@rounds_router.patch(
    "/{round_id}",
    response_model=RoundDetailResponse,
    summary="Atualizar rodada",
)
async def update_round_endpoint(
    round_id: uuid.UUID,
    body: RoundUpdateRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Atualiza deadline e/ou status de uma rodada. Apenas admins."""
    try:
        round_ = await verify_round_admin(
            db,
            round_id=round_id,
            user_id=current_user.id,
            load_nominations_and_votes=True,
        )
        round_ = await update_round(
            db,
            round_,
            deadline=body.deadline,
            new_status=body.status,
        )
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


@rounds_router.delete(
    "/{round_id}",
    response_model=MessageResponse,
    summary="Deletar rodada",
)
async def delete_round_endpoint(
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> MessageResponse:
    """Remove uma rodada (apenas em fase de indicação). Apenas admins."""
    try:
        round_ = await verify_round_admin(db, round_id=round_id, user_id=current_user.id)
        await delete_round(db, round_)
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MessageResponse(message="Rodada removida com sucesso.")
