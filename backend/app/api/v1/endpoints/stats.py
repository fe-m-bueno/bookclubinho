"""
Stats endpoints.

stats_group_router — montado em /groups/{group_id}/stats
  GET /                        — stats agregadas do grupo (todos os rounds finalizados)
  GET /round/{round_id}        — stats de uma rodada específica

stats_user_router — montado em /users
  GET /me/stats                — stats pessoais do usuário
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Request

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.schemas.stats import GroupStatsResponse, RoundStatsResponse, UserStatsResponse
from app.security.rate_limit import limiter
from app.services.stats import StatsError, get_group_stats, get_round_stats, get_user_stats

stats_group_router = APIRouter(tags=["stats"])
stats_user_router = APIRouter(tags=["stats"])


@stats_group_router.get(
    "",
    response_model=GroupStatsResponse,
    summary="Stats do grupo",
)
@limiter.limit("15/minute")
async def group_stats_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> GroupStatsResponse:
    """Retorna estatísticas agregadas do grupo em todos os rounds finalizados. Cache Redis 1h."""
    try:
        stats = await get_group_stats(db, group_id=group_id)
    except StatsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return GroupStatsResponse(**stats)


@stats_group_router.get(
    "/round/{round_id}",
    response_model=RoundStatsResponse,
    summary="Stats de uma rodada",
)
@limiter.limit("15/minute")
async def round_stats_endpoint(
    request: Request,
    group_id: uuid.UUID,
    round_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> RoundStatsResponse:
    """Retorna estatísticas de um round específico."""
    try:
        stats = await get_round_stats(db, group_id=group_id, round_id=round_id)
    except StatsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RoundStatsResponse(**stats)


@stats_user_router.get(
    "/me/stats",
    response_model=UserStatsResponse,
    summary="Minhas stats",
)
@limiter.limit("15/minute")
async def user_stats_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
) -> UserStatsResponse:
    """Retorna estatísticas pessoais do usuário em todos os grupos."""
    try:
        stats = await get_user_stats(db, user_id=current_user.id)
    except StatsError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return UserStatsResponse(**stats)
