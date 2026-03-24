"""
POST /api/v1/onboarding/profile     — atualiza perfil (username, display_name, avatar)
POST /api/v1/onboarding/preferences — define gêneros preferidos
POST /api/v1/onboarding/complete    — marca onboarding como concluído
"""

from __future__ import annotations

from fastapi import APIRouter, Form, HTTPException, Response, UploadFile

from app.core.cookies import set_auth_cookies
from app.core.deps import CurrentUser, DBSession  # noqa: TC001
from app.core.security import create_token_pair
from app.schemas.onboarding import (
    OnboardingCompleteResponse,
    OnboardingProfileResponse,
    PreferencesRequest,
    PreferencesResponse,
)
from app.services.onboarding import (
    OnboardingError,
    complete_onboarding,
    update_preferences,
    update_profile,
)

router = APIRouter(tags=["onboarding"])


@router.post(
    "/profile",
    response_model=OnboardingProfileResponse,
    summary="Atualizar perfil no onboarding",
)
async def onboarding_profile(
    db: DBSession,
    user: CurrentUser,
    username: str = Form(),
    display_name: str = Form(),
    status_text: str | None = Form(None),
    avatar: UploadFile | None = None,
) -> OnboardingProfileResponse:
    """Atualiza username, display_name, status_text e avatar durante o onboarding."""
    try:
        await update_profile(
            db=db,
            user=user,
            username=username,
            display_name=display_name,
            status_text=status_text,
            avatar=avatar,
        )
    except OnboardingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return OnboardingProfileResponse(message="Perfil atualizado com sucesso.")


@router.post(
    "/preferences",
    response_model=PreferencesResponse,
    summary="Definir gêneros preferidos",
)
async def onboarding_preferences(
    body: PreferencesRequest,
    db: DBSession,
    user: CurrentUser,
) -> PreferencesResponse:
    """Define os gêneros literários preferidos do usuário."""
    try:
        await update_preferences(
            db=db,
            user=user,
            preferred_genres=body.preferred_genres,
        )
    except OnboardingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return PreferencesResponse(message="Preferências salvas com sucesso.")


@router.post(
    "/complete",
    response_model=OnboardingCompleteResponse,
    summary="Concluir onboarding",
)
async def onboarding_complete(
    db: DBSession,
    user: CurrentUser,
    response: Response,
) -> OnboardingCompleteResponse:
    """Marca o onboarding como concluído após validar campos obrigatórios."""
    try:
        await complete_onboarding(db=db, user=user)
    except OnboardingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    access_token, refresh_token = create_token_pair(
        str(user.id),
        onboarding_completed=True,
    )
    set_auth_cookies(response, access_token, refresh_token)

    return OnboardingCompleteResponse(message="Onboarding concluído com sucesso.")
