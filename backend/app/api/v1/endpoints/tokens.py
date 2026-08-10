"""
POST   /api/v1/auth/tokens       — cria um personal access token
GET    /api/v1/auth/tokens       — lista os tokens ativos
DELETE /api/v1/auth/tokens/{id}  — revoga um token

Todas exigem sessão de navegador: um token não gerencia tokens — ver
`deps.get_current_user_session_only`.
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Request, status

from app.core.deps import DBSession, SessionOnlyUser  # noqa: TC001
from app.schemas.pat import (
    CreatedTokenResponse,
    CreateTokenRequest,
    RevokeTokenResponse,
    TokenListResponse,
    TokenResponse,
)
from app.security.rate_limit import limiter
from app.services.audit import TOKEN_CREATED, TOKEN_REVOKED, log_event
from app.services.pat import PATError, create_token, list_tokens, revoke_token

router = APIRouter(tags=["tokens"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CreatedTokenResponse,
    summary="Criar personal access token",
)
@limiter.limit("10/hour")
async def create(
    request: Request,
    body: CreateTokenRequest,
    user: SessionOnlyUser,
    db: DBSession,
) -> CreatedTokenResponse:
    """Cria um token e o devolve em claro — a única vez em que ele existe."""
    try:
        token, raw = await create_token(
            db,
            user_id=user.id,
            name=body.name,
            expires_in_days=body.expires_in_days,
        )
    except PATError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    await log_event(
        db,
        TOKEN_CREATED,
        user_id=user.id,
        resource_type="personal_access_token",
        resource_id=token.id,
        request=request,
    )
    return CreatedTokenResponse(
        id=token.id,
        name=token.name,
        prefix=token.prefix,
        last_used_at=token.last_used_at,
        expires_at=token.expires_at,
        created_at=token.created_at,
        token=raw,
    )


@router.get("", response_model=TokenListResponse, summary="Listar tokens ativos")
async def index(user: SessionOnlyUser, db: DBSession) -> TokenListResponse:
    tokens = await list_tokens(db, user.id)
    return TokenListResponse(tokens=[TokenResponse.model_validate(t) for t in tokens])


@router.delete("/{token_id}", response_model=RevokeTokenResponse, summary="Revogar token")
async def revoke(
    request: Request,
    token_id: uuid.UUID,
    user: SessionOnlyUser,
    db: DBSession,
) -> RevokeTokenResponse:
    try:
        await revoke_token(db, user_id=user.id, token_id=token_id)
    except PATError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    await log_event(
        db,
        TOKEN_REVOKED,
        user_id=user.id,
        resource_type="personal_access_token",
        resource_id=token_id,
        request=request,
    )
    return RevokeTokenResponse(message="Token revogado.")
