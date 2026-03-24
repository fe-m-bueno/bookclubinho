"""Wrapped endpoints - GET and POST for group wrapped reports.

wrapped_group_router — montado em /groups/{group_id}/wrapped
  GET /{year}   — buscar wrapped anual do grupo
  POST /{year}  — gerar ou regenerar wrapped anual do grupo
"""

from __future__ import annotations

import uuid  # noqa: TC003
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.schemas.wrapped import WrappedResponse
from app.security.rate_limit import limiter
from app.services.wrapped import WrappedError, generate_wrapped, get_wrapped

wrapped_group_router = APIRouter(tags=["wrapped"])


@wrapped_group_router.get(
    "/{year}",
    response_model=WrappedResponse,
    summary="Buscar Wrapped",
)
@limiter.limit("15/minute")
async def get_wrapped_endpoint(
    request: Request,
    group_id: uuid.UUID,
    year: int,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> WrappedResponse:
    """Retorna o wrapped anual do grupo para um ano específico."""
    _validate_year(year)
    try:
        result = await get_wrapped(db, group_id=group_id, year=year)
    except WrappedError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return WrappedResponse(**result)


@wrapped_group_router.post(
    "/{year}",
    response_model=WrappedResponse,
    summary="Gerar Wrapped",
)
@limiter.limit("3/minute")
async def generate_wrapped_endpoint(
    request: Request,
    group_id: uuid.UUID,
    year: int,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> WrappedResponse:
    """Gera ou regenera o wrapped anual do grupo."""
    _validate_year(year)
    try:
        result = await generate_wrapped(db, group_id=group_id, year=year, user_id=current_user.id)
    except WrappedError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return WrappedResponse(**result)


def _validate_year(year: int) -> None:
    if year < 2020 or year > datetime.now().year:
        raise HTTPException(status_code=400, detail=f"Ano inválido: {year}")
