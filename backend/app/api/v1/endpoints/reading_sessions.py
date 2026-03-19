"""
Reading session endpoints — montado em /reading-sessions

  POST /start                — inicia uma sessão de leitura
  POST /{session_id}/stop    — encerra uma sessão ativa
  GET  /me                   — lista minhas sessões (cursor-based)
"""

from __future__ import annotations

import uuid  # noqa: TC003 — required at runtime for FastAPI path-param resolution

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.deps import CurrentUser, DBSession
from app.db.models.reading_session import ReadingSession  # noqa: TC001
from app.schemas.reading_session import (
    SessionListResponse,
    SessionResponse,
    SessionStartRequest,
    SessionStopRequest,
)
from app.security.rate_limit import limiter
from app.services.reading_session import ReadingSessionError, list_my_sessions, start_session, stop_session

router = APIRouter(tags=["reading-sessions"])


def _session_to_response(session: ReadingSession) -> SessionResponse:
    return SessionResponse(
        id=str(session.id),
        user_id=str(session.user_id),
        round_id=str(session.round_id),
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_minutes=session.duration_minutes,
        created_at=session.created_at,
    )


@router.post(
    "/start",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Iniciar sessão de leitura",
)
@limiter.limit("20/minute")
async def start_reading_session(
    request: Request,
    body: SessionStartRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> SessionResponse:
    """Inicia uma sessão de leitura. A rodada deve estar em fase de leitura."""
    try:
        round_id = uuid.UUID(body.round_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="round_id inválido.",
        ) from exc

    try:
        session = await start_session(db=db, round_id=round_id, user_id=current_user.id)
    except ReadingSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _session_to_response(session)


@router.post(
    "/{session_id}/stop",
    response_model=SessionResponse,
    summary="Encerrar sessão de leitura",
)
@limiter.limit("20/minute")
async def stop_reading_session(
    request: Request,
    session_id: uuid.UUID,
    body: SessionStopRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> SessionResponse:
    """Encerra uma sessão ativa e registra a duração."""
    try:
        session = await stop_session(
            db=db,
            session_id=session_id,
            user_id=current_user.id,
            duration_override_minutes=body.duration_override_minutes,
        )
    except ReadingSessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _session_to_response(session)


@router.get(
    "/me",
    response_model=SessionListResponse,
    summary="Listar minhas sessões de leitura",
)
@limiter.limit("30/minute")
async def list_reading_sessions(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    round_id: uuid.UUID | None = Query(default=None, description="Filtrar por rodada"),
    cursor: str | None = Query(default=None, description="Cursor ISO8601 para paginação"),
    limit: int = Query(default=20, ge=1, le=50),
) -> SessionListResponse:
    """Lista as sessões de leitura do usuário autenticado."""
    sessions, total_duration, next_cursor = await list_my_sessions(
        db=db,
        user_id=current_user.id,
        round_id=round_id,
        cursor=cursor,
        limit=limit,
    )
    return SessionListResponse(
        sessions=[_session_to_response(s) for s in sessions],
        total_duration_minutes=total_duration,
        next_cursor=next_cursor,
    )
