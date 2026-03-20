"""
GET /api/v1/users/me                      — dados do usuário autenticado
GET /api/v1/users/check-username/{username} — verifica disponibilidade de username
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.deps import CurrentUser, DBSession  # noqa: TC001
from app.schemas.onboarding import UsernameCheckResponse
from app.schemas.user import UserRead
from app.security.rate_limit import limiter
from app.services.onboarding import check_username_available

router = APIRouter(tags=["users"])


@router.get(
    "/me",
    response_model=UserRead,
    summary="Dados do usuário autenticado",
)
@limiter.limit("30/minute")
async def get_me(
    request: Request,
    user: CurrentUser,
) -> UserRead:
    """Retorna os dados completos do usuário autenticado."""
    return UserRead.model_validate(user)


@router.get(
    "/check-username/{username}",
    response_model=UsernameCheckResponse,
    summary="Verificar disponibilidade de username",
)
@limiter.limit("20/minute")
async def check_username(
    request: Request,
    username: str,
    db: DBSession,
    user: CurrentUser,
) -> UsernameCheckResponse:
    """Verifica se o username informado está disponível (case-insensitive)."""
    available = await check_username_available(db=db, username=username)
    return UsernameCheckResponse(available=available)
