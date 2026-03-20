"""
GET    /api/v1/users/me                      — dados do usuário autenticado
PATCH  /api/v1/users/me                      — atualiza perfil do usuário autenticado
POST   /api/v1/users/me/avatar               — upload de avatar
DELETE /api/v1/users/me/avatar               — remove avatar
GET    /api/v1/users/check-username/{username} — verifica disponibilidade de username
GET    /api/v1/users/{user_id}/profile       — perfil público enriquecido
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, UploadFile, status

from app.core.deps import CurrentUser, DBSession  # noqa: TC001
from app.core.exceptions import ServiceError
from app.schemas.onboarding import UsernameCheckResponse
from app.schemas.user import AvatarResponse, UserProfilePublic, UserRead, UserUpdate
from app.security.rate_limit import limiter
from app.services.onboarding import check_username_available
from app.services.user_profile import ProfileError, get_public_profile, update_user_profile
from app.services.user_profile import delete_user_avatar as svc_delete_avatar
from app.services.user_profile import upload_user_avatar as svc_upload_avatar

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


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Atualiza perfil do usuário autenticado",
)
@limiter.limit("10/minute")
async def patch_me(
    request: Request,
    body: UserUpdate,
    user: CurrentUser,
    db: DBSession,
) -> UserRead:
    """Atualiza parcialmente o perfil do usuário autenticado."""
    try:
        updated = await update_user_profile(db=db, user=user, payload=body)
    except ProfileError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return UserRead.model_validate(updated)


@router.post(
    "/me/avatar",
    response_model=AvatarResponse,
    summary="Upload de avatar",
)
@limiter.limit("5/minute")
async def upload_avatar(
    request: Request,
    avatar: UploadFile,
    user: CurrentUser,
    db: DBSession,
) -> AvatarResponse:
    """Faz upload do avatar do usuário autenticado."""
    try:
        avatar_url = await svc_upload_avatar(db=db, user=user, avatar=avatar)
    except (ProfileError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return AvatarResponse(avatar_url=avatar_url)


@router.delete(
    "/me/avatar",
    status_code=status.HTTP_200_OK,
    summary="Remove avatar",
)
@limiter.limit("5/minute")
async def delete_avatar(
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Remove o avatar do usuário autenticado."""
    try:
        await svc_delete_avatar(db=db, user=user)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao remover avatar.",
        ) from exc
    return {"detail": "ok"}


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
    """Verifica se o username informado está disponível (case-insensitive).

    Exclui o próprio usuário autenticado da verificação.
    """
    available = await check_username_available(
        db=db, username=username, exclude_user_id=user.id
    )
    return UsernameCheckResponse(available=available)


@router.get(
    "/{user_id}/profile",
    response_model=UserProfilePublic,
    summary="Perfil público de um usuário",
)
@limiter.limit("30/minute")
async def get_user_profile(
    request: Request,
    user_id: uuid.UUID,
    db: DBSession,
    user: CurrentUser,
) -> UserProfilePublic:
    """Retorna o perfil público enriquecido de um usuário."""
    try:
        profile = await get_public_profile(db=db, user_id=user_id)
    except ProfileError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return UserProfilePublic.model_validate(profile)
