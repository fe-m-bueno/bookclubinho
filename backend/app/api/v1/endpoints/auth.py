"""
POST /api/v1/auth/register  — cria conta e envia e-mail de verificação
POST /api/v1/auth/verify-email  — valida token do Redis e marca e-mail como verificado
POST /api/v1/auth/login  — autentica e seta cookies httpOnly (access + refresh)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.deps import DBSession  # noqa: TC001
from app.schemas.auth import LoginResponse, RegisterRequest, RegisterResponse, VerifyEmailResponse
from app.security.rate_limit import limiter
from app.services.auth import AuthError, authenticate_user, register_user, verify_email_token

router = APIRouter(tags=["auth"])

_COOKIE_KWARGS = {
    "httponly": True,
    "secure": True,
    "samesite": "lax",
    "path": "/",
}

# Annotated alias evita B008 (Depends() em default de argumento)
_FormData = Annotated[OAuth2PasswordRequestForm, Depends()]  # noqa: TC002


# ── Register ──────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
    summary="Criar conta",
)
async def register(body: RegisterRequest, db: DBSession) -> RegisterResponse:  # noqa: TC001
    """Cria um novo usuário e envia e-mail de verificação.

    Retorna sempre 201 independentemente de o e-mail já existir (anti-enumeration).
    """
    await register_user(
        db=db,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
    )
    return RegisterResponse(
        message="Conta criada. Verifique seu e-mail para ativar o acesso."
    )


# ── Verify email ──────────────────────────────────────────────────────────────


@router.post(
    "/verify-email",
    response_model=VerifyEmailResponse,
    summary="Verificar e-mail",
)
async def verify_email(token: str, db: DBSession) -> VerifyEmailResponse:  # noqa: TC001
    """Consome o token de verificação armazenado no Redis e ativa o e-mail do usuário."""
    ok = await verify_email_token(db=db, token=token)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token inválido ou expirado.",
        )
    return VerifyEmailResponse(message="E-mail verificado com sucesso.")


# ── Login ─────────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Autenticar",
)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    form_data: _FormData,
    db: DBSession,  # noqa: TC001
) -> LoginResponse:
    """Autentica o usuário e seta cookies httpOnly com access_token e refresh_token.

    Rate limit: 10 requisições por minuto por IP.
    """
    try:
        access_token, refresh_token = await authenticate_user(
            db=db,
            email=form_data.username,
            password=form_data.password,
        )
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    response.set_cookie("access_token", access_token, **_COOKIE_KWARGS)
    response.set_cookie("refresh_token", refresh_token, **_COOKIE_KWARGS)

    return LoginResponse(message="Login realizado com sucesso.")
