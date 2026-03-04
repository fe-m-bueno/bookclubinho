"""
POST /api/v1/auth/register  — cria conta e envia e-mail de verificação
POST /api/v1/auth/verify-email  — valida token do Redis e marca e-mail como verificado
POST /api/v1/auth/login  — autentica e seta cookies httpOnly (access + refresh)
POST /api/v1/auth/magic-link  — solicita magic link por e-mail
GET  /api/v1/auth/magic/callback  — valida magic token e autentica
GET  /api/v1/auth/google/login  — redireciona para consentimento Google
GET  /api/v1/auth/google/callback  — recebe code, autentica e redireciona
"""

from __future__ import annotations

import secrets
from typing import Annotated
from urllib.parse import urlencode

import redis.asyncio as aioredis
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from app.core.config import settings
from app.core.deps import DBSession  # noqa: TC001
from app.schemas.auth import (
    LoginResponse,
    LogoutResponse,
    MagicLinkRequest,
    MagicLinkResponse,
    RefreshResponse,
    RegisterRequest,
    RegisterResponse,
    ResendVerificationRequest,
    ResendVerificationResponse,
    VerifyEmailResponse,
)
from app.security.rate_limit import limiter
from app.services.auth import (
    AuthError,
    authenticate_user,
    blacklist_refresh_token,
    consume_magic_token,
    google_oauth_callback,
    register_user,
    resend_verification_email,
    rotate_refresh_token,
    send_magic_link,
    verify_email_token,
)

router = APIRouter(tags=["auth"])

_COOKIE_KWARGS = {
    "httponly": True,
    "secure": True,
    "samesite": "lax",
    "path": "/",
}

# Annotated alias evita B008 (Depends() em default de argumento)
_FormData = Annotated[OAuth2PasswordRequestForm, Depends()]  # noqa: TC002

_OAUTH_STATE_TTL = 600  # 10 minutos


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Seta os cookies httpOnly de autenticação na resposta."""
    response.set_cookie("access_token", access_token, **_COOKIE_KWARGS)
    response.set_cookie("refresh_token", refresh_token, **_COOKIE_KWARGS)


def _redis_client() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


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


# ── Resend verification ───────────────────────────────────────────────────────


@router.post(
    "/resend-verification",
    status_code=status.HTTP_200_OK,
    response_model=ResendVerificationResponse,
    summary="Reenviar e-mail de verificação",
)
@limiter.limit("5/hour")
async def resend_verification(
    request: Request,
    body: ResendVerificationRequest,
    db: DBSession,  # noqa: TC001
) -> ResendVerificationResponse:
    """Reenvia e-mail de verificação.

    Retorna sempre 200 com a mesma mensagem (anti-enumeration).
    Rate limit: 5 requisições por hora por IP.
    """
    await resend_verification_email(db=db, email=body.email)
    return ResendVerificationResponse(
        message="Se o e-mail estiver cadastrado, enviaremos um novo link de verificação."
    )


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

    _set_auth_cookies(response, access_token, refresh_token)

    return LoginResponse(message="Login realizado com sucesso.")


# ── Magic Link ────────────────────────────────────────────────────────────────


@router.post("/magic-link", status_code=200, response_model=MagicLinkResponse)
async def request_magic_link(body: MagicLinkRequest, db: DBSession) -> MagicLinkResponse:  # noqa: TC001
    """Solicita magic link por e-mail.

    Retorna sempre 200 independentemente de o e-mail já existir (anti-enumeration).
    Rate limit por e-mail é gerenciado no service layer.
    """
    await send_magic_link(db=db, email=body.email)
    return MagicLinkResponse(
        message="Se o e-mail estiver cadastrado, você receberá um link em breve."
    )


@router.get("/magic/callback", response_class=RedirectResponse)
async def magic_link_callback(token: str, db: DBSession) -> RedirectResponse:  # noqa: TC001
    """Valida magic token, autentica o usuário e redireciona."""
    try:
        access_token, refresh_token, onboarding_completed = await consume_magic_token(
            db=db, token=token
        )
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    base_url = settings.APP_URL.rstrip("/")
    redirect_url = f"{base_url}/" if onboarding_completed else f"{base_url}/onboarding"

    response = RedirectResponse(url=redirect_url, status_code=303)
    _set_auth_cookies(response, access_token, refresh_token)
    return response


# ── Logout ────────────────────────────────────────────────────────────────────


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> LogoutResponse:
    """Invalida o refresh token (blacklist no Redis) e limpa os cookies de auth."""
    if refresh_token:
        await blacklist_refresh_token(refresh_token)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return LogoutResponse(message="Logout realizado com sucesso.")


# ── Refresh ────────────────────────────────────────────────────────────────────


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
) -> RefreshResponse:
    """Valida o refresh token, verifica blacklist e emite novo par de tokens (rotação)."""
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado.")
    try:
        new_access, new_refresh = await rotate_refresh_token(refresh_token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    _set_auth_cookies(response, new_access, new_refresh)
    return RefreshResponse(message="Tokens renovados com sucesso.")


# ── Google OAuth2 ─────────────────────────────────────────────────────────────


@router.get("/google/login", response_class=RedirectResponse)
async def google_login() -> RedirectResponse:
    """Redireciona para a tela de consentimento do Google."""
    state = secrets.token_urlsafe(32)

    redis = _redis_client()
    try:
        await redis.set(f"oauth_state:{state}", "1", ex=_OAUTH_STATE_TTL)
    finally:
        await redis.aclose()

    params = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
        status_code=302,
    )


@router.get("/google/callback", response_class=RedirectResponse)
async def google_callback(
    db: DBSession,  # noqa: TC001
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Recebe o authorization code do Google, autentica e redireciona."""
    base_url = settings.APP_URL.rstrip("/")
    error_redirect = RedirectResponse(
        url=f"{base_url}/login?error=oauth_failed", status_code=303
    )

    if error or not code or not state:
        return error_redirect

    redis = _redis_client()
    try:
        stored = await redis.get(f"oauth_state:{state}")
        if not stored:
            return error_redirect
        await redis.delete(f"oauth_state:{state}")
    finally:
        await redis.aclose()

    try:
        access_token, refresh_token, onboarding_completed = await google_oauth_callback(
            code=code, db=db
        )
    except AuthError:
        return error_redirect

    redirect_url = f"{base_url}/" if onboarding_completed else f"{base_url}/onboarding"
    response = RedirectResponse(url=redirect_url, status_code=303)
    _set_auth_cookies(response, access_token, refresh_token)
    return response
