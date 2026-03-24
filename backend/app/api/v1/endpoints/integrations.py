"""
POST   /api/v1/integrations/hardcover        — conectar Hardcover
DELETE /api/v1/integrations/hardcover        — desconectar Hardcover
GET    /api/v1/integrations/hardcover/status — status da conexão
PATCH  /api/v1/integrations/hardcover/sync   — toggle auto-sync
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.core.deps import CurrentUser, DBSession
from app.schemas.integration import (
    HardcoverConnectRequest,
    HardcoverStatusResponse,
    IntegrationToggleRequest,
)
from app.schemas.user import UserRead
from app.security.rate_limit import limiter
from app.services.integration import (
    IntegrationError,
    connect_hardcover,
    disconnect_hardcover,
    get_hardcover_status,
    toggle_auto_sync,
)

router = APIRouter(tags=["integrations"])


@router.post(
    "/hardcover",
    response_model=HardcoverStatusResponse,
    summary="Conectar conta Hardcover",
)
@limiter.limit("5/minute")
async def post_hardcover_connect(
    request: Request,
    body: HardcoverConnectRequest,
    user: CurrentUser,
    db: DBSession,
) -> HardcoverStatusResponse:
    """Valida o token Hardcover, criptografa e armazena. Retorna status da conexão."""
    try:
        hardcover_username = await connect_hardcover(db=db, user=user, token=body.token)
    except IntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return HardcoverStatusResponse(connected=True, hardcover_username=hardcover_username)


@router.delete(
    "/hardcover",
    response_model=HardcoverStatusResponse,
    summary="Desconectar conta Hardcover",
)
@limiter.limit("5/minute")
async def delete_hardcover_disconnect(
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> HardcoverStatusResponse:
    """Remove o token Hardcover e desativa a sincronização automática."""
    await disconnect_hardcover(db=db, user=user)
    return HardcoverStatusResponse(connected=False)


@router.get(
    "/hardcover/status",
    response_model=HardcoverStatusResponse,
    summary="Status da integração Hardcover",
)
@limiter.limit("30/minute")
async def get_hardcover_status_endpoint(
    request: Request,
    user: CurrentUser,
    db: DBSession,
) -> HardcoverStatusResponse:
    """Verifica se a conta Hardcover está conectada e retorna o username."""
    status = await get_hardcover_status(db=db, user=user)
    return HardcoverStatusResponse(**status)


@router.patch(
    "/hardcover/sync",
    response_model=UserRead,
    summary="Toggle auto-sync Hardcover",
)
@limiter.limit("10/minute")
async def patch_hardcover_sync(
    request: Request,
    body: IntegrationToggleRequest,
    user: CurrentUser,
    db: DBSession,
) -> UserRead:
    """Ativa ou desativa a sincronização automática com o Hardcover."""
    try:
        await toggle_auto_sync(db=db, user=user, enabled=body.auto_sync_hardcover)
    except IntegrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return UserRead.model_validate(user)
