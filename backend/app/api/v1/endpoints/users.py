"""
GET    /api/v1/users/me                           — dados do usuário autenticado
PATCH  /api/v1/users/me                           — atualiza perfil do usuário autenticado
POST   /api/v1/users/me/avatar                    — upload de avatar
DELETE /api/v1/users/me/avatar                    — remove avatar
POST   /api/v1/users/me/data-export               — solicitar exportação de dados
DELETE /api/v1/users/me/account                   — excluir conta
GET    /api/v1/users/check-username/{username}    — verifica disponibilidade de username
GET    /api/v1/users/{user_id}/profile            — perfil público enriquecido por ID
GET    /api/v1/users/by-username/{username}/profile       — perfil público por username
GET    /api/v1/users/by-username/{username}/shared-groups — grupos em comum
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile, status

from app.core.cookies import clear_auth_cookies
from app.core.deps import CurrentUser, DBSession, OptionalUser  # noqa: TC001
from app.core.redis import get_redis
from app.schemas.notification import NotificationPreferencesUpdate  # noqa: TC001
from app.schemas.onboarding import UsernameCheckResponse
from app.schemas.privacy import DataExportResponse, DeleteAccountRequest
from app.schemas.user import (
    AvatarResponse,
    SharedGroupSummary,
    UserProfilePublic,
    UserProfilePublicEnriched,
    UserRead,
    UserUpdate,
)
from app.security.rate_limit import limiter
from app.services.account_deletion import AccountDeletionError, delete_account
from app.services.data_export import DataExportError, request_data_export
from app.services.notification_preferences import (
    get_notification_preferences as svc_get_notification_preferences,
)
from app.services.notification_preferences import (
    update_notification_preferences as svc_update_notification_preferences,
)
from app.services.onboarding import check_username_available
from app.services.shared_groups import get_shared_groups
from app.services.user_profile import (
    ProfileError,
    get_public_profile,
    get_public_profile_by_username,
    update_user_profile,
)
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


# ── By-username endpoints ──────────────────────────────────────────────────────


@router.get(
    "/by-username/{username}/profile",
    response_model=UserProfilePublicEnriched,
    summary="Perfil público por username",
)
@limiter.limit("30/minute")
async def get_profile_by_username(
    request: Request,
    username: str,
    db: DBSession,
    viewer: OptionalUser,
) -> UserProfilePublicEnriched:
    """Retorna o perfil público enriquecido de um usuário buscado pelo username.

    Inclui shared_group_count quando o viewer é um usuário autenticado diferente do alvo.
    """
    viewer_id = viewer.id if viewer else None
    try:
        profile = await get_public_profile_by_username(
            db=db, username=username, viewer_id=viewer_id
        )
    except ProfileError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return UserProfilePublicEnriched.model_validate(profile)


@router.get(
    "/by-username/{username}/shared-groups",
    response_model=list[SharedGroupSummary],
    summary="Grupos em comum com um usuário",
)
@limiter.limit("20/minute")
async def get_shared_groups_endpoint(
    request: Request,
    username: str,
    db: DBSession,
    viewer: CurrentUser,
) -> list[SharedGroupSummary]:
    """Retorna grupos que o viewer autenticado e o usuário-alvo têm em comum."""
    from sqlalchemy import func, select

    from app.db.models.user import User

    result = await db.execute(
        select(User).where(func.lower(User.username) == username.lower())
    )
    target = result.scalar_one_or_none()
    if target is None or not target.is_active:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    groups = await get_shared_groups(
        db=db, viewer_id=viewer.id, target_user_id=target.id
    )
    return [SharedGroupSummary.model_validate(g) for g in groups]


# ── Privacy / account lifecycle ────────────────────────────────────────────────


@router.post(
    "/me/data-export",
    response_model=DataExportResponse,
    summary="Solicitar exportação de dados pessoais",
)
@limiter.limit("3/day")
async def post_data_export(
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> DataExportResponse:
    """Coleta os dados do usuário, faz upload no R2 e envia link por e-mail.

    Limitado a uma exportação por 24 horas. Retorna cooldown_until se em espera.
    """
    redis = get_redis()
    try:
        result = await request_data_export(redis=redis, db=db, user=user)
    except DataExportError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return DataExportResponse(**result)


@router.delete(
    "/me/account",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir conta permanentemente",
)
@limiter.limit("3/hour")
async def delete_account_endpoint(
    request: Request,
    response: Response,
    body: DeleteAccountRequest,
    user: CurrentUser,
    db: DBSession,
) -> None:
    """Anonimiza e soft-deleta a conta do usuário autenticado.

    Exige confirmação com a string literal "EXCLUIR".
    Para contas locais, também exige a senha atual.
    Revoga todas as sessões ativas.
    """
    redis = get_redis()
    try:
        await delete_account(
            db=db,
            redis=redis,
            user=user,
            confirmation=body.confirmation,
            current_password=body.current_password,
        )
    except AccountDeletionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    clear_auth_cookies(response)


# ── Notification preferences ───────────────────────────────────────────────────


@router.get(
    "/me/notifications",
    summary="Preferências de notificação do usuário autenticado",
)
@limiter.limit("30/minute")
async def get_notification_preferences(
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, bool]:
    """Retorna as preferências de notificação por e-mail do usuário."""
    return await svc_get_notification_preferences(db=db, user_id=user.id)


@router.patch(
    "/me/notifications",
    summary="Atualiza preferências de notificação",
)
@limiter.limit("10/minute")
async def patch_notification_preferences(
    request: Request,
    body: NotificationPreferencesUpdate,
    user: CurrentUser,
    db: DBSession,
) -> dict[str, bool]:
    """Atualiza parcialmente as preferências de notificação. O campo 'auth' não pode ser desabilitado."""
    return await svc_update_notification_preferences(db=db, user_id=user.id, payload=body)
