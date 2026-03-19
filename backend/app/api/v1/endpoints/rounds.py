"""
Round endpoints.

group_rounds_router — montado em /groups/{group_id}/rounds
  POST /           — admin cria rodada
  GET /            — membro lista rodadas
  GET /current     — membro busca rodada ativa

rounds_router — montado em /rounds
  PATCH /{round_id}                          — admin atualiza rodada
  DELETE /{round_id}                         — admin deleta rodada
  POST /{round_id}/nominate                  — membro indica livro
  DELETE /{round_id}/nominations/{nom_id}    — membro remove própria indicação
  POST /{round_id}/start-voting              — admin inicia votação
  POST /{round_id}/vote                      — membro vota
  POST /{round_id}/finalize                  — admin finaliza votação
  POST /{round_id}/start-review             — admin inicia fase de reviews
  POST /{round_id}/finish                    — admin encerra rodada
  POST /{round_id}/progress                  — membro registra progresso de leitura
  GET  /{round_id}/progress                  — membro consulta progresso do grupo
  GET  /{round_id}/progress/me               — membro consulta próprio progresso
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
from app.db.models.reading_progress import ReadingProgress  # noqa: TC001
from app.db.models.round import Round, RoundNomination  # noqa: TC001
from app.schemas.group import MessageResponse
from app.schemas.reading_progress import (
    GroupProgressResponse,
    MemberProgressSummary,
    ProgressResponse,
    ProgressUpdateRequest,
)
from app.schemas.round import (
    BookSummary,
    FinalizeRequest,
    FinalizeResponse,
    NominationCreateRequest,
    NominationSummary,
    RoundCreateRequest,
    RoundCreateResponse,
    RoundDetailResponse,
    RoundListItem,
    RoundListResponse,
    RoundUpdateRequest,
    VoteCastRequest,
)
from app.security.rate_limit import limiter
from app.services import reading_progress as reading_progress_service
from app.services.reading_progress import ReadingProgressError
from app.services.round import (
    RoundError,
    add_nomination,
    cast_vote,
    create_round,
    delete_round,
    finalize_round,
    finish_round,
    get_current_round,
    list_rounds,
    remove_nomination,
    start_review,
    start_voting,
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
        book_hardcover_slug=nomination.book_hardcover_slug,
        book_page_count=nomination.book_page_count,
        pitch=nomination.pitch,
        user_id=str(nomination.user_id),
        nominated_at=nomination.nominated_at,
        vote_count=len(nomination.votes),
    )


def _progress_to_response(progress: "ReadingProgress") -> ProgressResponse:
    return ProgressResponse(
        id=str(progress.id),
        user_id=str(progress.user_id),
        current_page=progress.current_page,
        percentage=progress.percentage,
        is_finished=progress.percentage >= 100.0,
        progress_type=progress.progress_type,
        total_pages=progress.total_pages,
        note=progress.note,
        created_at=progress.created_at,
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
        tiebreak_info=round_.tiebreak_info,
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


@rounds_router.post(
    "/{round_id}/nominate",
    response_model=RoundDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Indicar livro",
)
@limiter.limit("20/minute")
async def nominate_book(
    request: Request,
    round_id: uuid.UUID,
    body: NominationCreateRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Indica um livro na rodada. Máximo 3 indicações por usuário. Status deve ser 'nominating'."""
    try:
        _, round_ = await add_nomination(db, round_id=round_id, user_id=current_user.id, data=body)
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


@rounds_router.delete(
    "/{round_id}/nominations/{nomination_id}",
    response_model=MessageResponse,
    summary="Remover indicação",
)
@limiter.limit("20/minute")
async def remove_nomination_endpoint(
    request: Request,
    round_id: uuid.UUID,
    nomination_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> MessageResponse:
    """Remove uma indicação própria. Status deve ser 'nominating'."""
    try:
        await remove_nomination(
            db,
            round_id=round_id,
            nomination_id=nomination_id,
            user_id=current_user.id,
        )
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MessageResponse(message="Indicação removida com sucesso.")


@rounds_router.post(
    "/{round_id}/start-voting",
    response_model=RoundDetailResponse,
    summary="Iniciar votação",
)
@limiter.limit("10/minute")
async def start_voting_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Inicia a fase de votação. Requer pelo menos 2 indicações. Apenas admins."""
    try:
        round_ = await start_voting(db, round_id=round_id, user_id=current_user.id)
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


@rounds_router.post(
    "/{round_id}/vote",
    response_model=RoundDetailResponse,
    summary="Votar em indicação",
)
@limiter.limit("20/minute")
async def cast_vote_endpoint(
    request: Request,
    round_id: uuid.UUID,
    body: VoteCastRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Vota em uma indicação. Chamar novamente troca o voto. Status deve ser 'voting'."""
    try:
        _, round_ = await cast_vote(
            db,
            round_id=round_id,
            user_id=current_user.id,
            nomination_id=body.nomination_id,
        )
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


@rounds_router.post(
    "/{round_id}/finalize",
    response_model=FinalizeResponse,
    summary="Finalizar votação",
)
@limiter.limit("10/minute")
async def finalize_round_endpoint(
    request: Request,
    round_id: uuid.UUID,
    body: FinalizeRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> FinalizeResponse:
    """Conta votos, resolve empates e transiciona para 'reading'. Apenas admins."""
    try:
        round_ = await finalize_round(
            db,
            round_id=round_id,
            user_id=current_user.id,
            deadline=body.deadline,
        )
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    tiebreak_info = round_.tiebreak_info or {}
    return FinalizeResponse(
        book=BookSummary(
            book_id=round_.book_id,
            title=round_.book_title,
            author=round_.book_author,
            cover_url=round_.book_cover_url,
            page_count=round_.book_page_count,
        ),
        was_tiebreak=tiebreak_info.get("was_tiebreak", False),
    )


@rounds_router.post(
    "/{round_id}/start-review",
    response_model=RoundDetailResponse,
    summary="Iniciar fase de reviews",
)
@limiter.limit("10/minute")
async def start_review_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Transiciona rodada de 'reading' para 'reviewing'. Apenas admins."""
    try:
        round_ = await start_review(db, round_id=round_id, user_id=current_user.id)
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


@rounds_router.post(
    "/{round_id}/finish",
    response_model=RoundDetailResponse,
    summary="Encerrar rodada",
)
@limiter.limit("10/minute")
async def finish_round_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundDetailResponse:
    """Encerra a rodada. Requer pelo menos 1 review submetida. Apenas admins."""
    try:
        round_ = await finish_round(db, round_id=round_id, user_id=current_user.id)
    except RoundError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _round_to_detail(round_)


# ── Reading progress ──────────────────────────────────────────────────────────


@rounds_router.post(
    "/{round_id}/progress",
    response_model=ProgressResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar progresso de leitura",
)
@limiter.limit("30/minute")
async def log_reading_progress(
    request: Request,
    round_id: uuid.UUID,
    body: ProgressUpdateRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> ProgressResponse:
    """Registra um snapshot de progresso de leitura. Rodada deve estar em 'reading'."""
    try:
        progress = await reading_progress_service.log_progress(
            db=db,
            round_id=round_id,
            user_id=current_user.id,
            current_page=body.current_page,
            percentage=body.percentage,
            progress_type=body.progress_type,
            total_pages=body.total_pages,
            note=body.note,
        )
    except ReadingProgressError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return _progress_to_response(progress)


@rounds_router.get(
    "/{round_id}/progress/me",
    response_model=ProgressResponse | None,
    summary="Meu progresso de leitura",
)
@limiter.limit("30/minute")
async def get_my_reading_progress(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> ProgressResponse | None:
    """Retorna o snapshot mais recente do próprio progresso nesta rodada."""
    progress = await reading_progress_service.get_my_progress(
        db=db,
        round_id=round_id,
        user_id=current_user.id,
    )
    if progress is None:
        return None
    return _progress_to_response(progress)


@rounds_router.get(
    "/{round_id}/progress",
    response_model=GroupProgressResponse,
    summary="Progresso de leitura do grupo",
)
@limiter.limit("30/minute")
async def get_group_reading_progress(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> GroupProgressResponse:
    """Retorna o progresso mais recente de cada membro do grupo nesta rodada."""
    progress_list, round_started_at = await reading_progress_service.get_group_progress(
        db=db,
        round_id=round_id,
        user_id=current_user.id,
    )
    return GroupProgressResponse(
        progress=[MemberProgressSummary(**p) for p in progress_list],
        round_started_at=round_started_at,
    )
