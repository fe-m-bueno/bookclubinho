"""
POST  /api/v1/auth/register       — cria conta e envia e-mail de verificação
POST  /api/v1/auth/verify-email   — valida token do Redis e marca e-mail como verificado
POST  /api/v1/auth/login          — autentica e seta cookies httpOnly (access + refresh)
POST  /api/v1/auth/magic-link     — solicita magic link por e-mail
GET   /api/v1/auth/magic/callback — valida magic token e autentica
GET   /api/v1/auth/google/login   — redireciona para consentimento Google
GET   /api/v1/auth/google/callback — recebe code, autentica e redireciona
PATCH /api/v1/auth/password       — altera senha (contas locais)
PATCH /api/v1/auth/email          — inicia troca de e-mail
GET   /api/v1/auth/email/confirm  — confirma troca de e-mail via token
"""

from __future__ import annotations

import secrets
import uuid
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from app.core.config import settings
from app.core.cookies import clear_auth_cookies, set_auth_cookies
from app.core.deps import CurrentRefreshJTI, CurrentUser, DBSession  # noqa: TC001
from app.core.redis import get_redis
from app.schemas.account import ChangeEmailRequest, ChangePasswordRequest, MessageResponse
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
from app.schemas.session import SessionListResponse, SessionResponse
from app.security.rate_limit import limiter
from app.services.account import (
    AccountError,
    change_password,
    confirm_email_change,
    initiate_email_change,
)
from app.services.audit import (
    LOGIN_FAILED,
    LOGIN_SUCCESS,
    MAGIC_LINK_USED,
    OAUTH_LOGIN,
    PASSWORD_CHANGED,
    log_event,
)
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
from app.services.session import (
    SessionError,
    list_sessions,
    revoke_all_other_sessions,
    revoke_session,
)

router = APIRouter(tags=["auth"])

# Annotated alias evita B008 (Depends() em default de argumento)
_FormData = Annotated[OAuth2PasswordRequestForm, Depends()]  # noqa: TC002

_OAUTH_STATE_TTL = 600  # 10 minutos


# ── CSRF seed ────────────────────────────────────────────────────────────────


@router.get(
    "/csrf",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Seed CSRF cookie",
)
async def csrf_seed() -> None:
    """Return 204 so the CSRF middleware can set the cookie on the response."""


# ── Register ──────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
    summary="Criar conta",
)
@limiter.limit("5/hour")
async def register(
    request: Request,
    body: RegisterRequest,
    db: DBSession,  # noqa: TC001
) -> RegisterResponse:
    """Cria um novo usuário e envia e-mail de verificação.

    Retorna sempre 201 independentemente de o e-mail já existir (anti-enumeration).
    Rate limit: 5 requisições por hora por IP.
    """
    await register_user(
        db=db,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
    )
    return RegisterResponse(message="Conta criada. Verifique seu e-mail para ativar o acesso.")


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
    return ResendVerificationResponse(message="Se o e-mail estiver cadastrado, enviaremos um novo link de verificação.")


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
            user_agent=request.headers.get("User-Agent"),
            client_ip=request.client.host if request.client else None,
        )
    except AuthError as exc:
        await log_event(db, LOGIN_FAILED, request=request)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    set_auth_cookies(response, access_token, refresh_token)
    await log_event(db, LOGIN_SUCCESS, request=request)

    return LoginResponse(message="Login realizado com sucesso.")


# ── Magic Link ────────────────────────────────────────────────────────────────


@router.post("/magic-link", status_code=200, response_model=MagicLinkResponse)
@limiter.limit("10/hour")
async def request_magic_link(
    request: Request,
    body: MagicLinkRequest,
    db: DBSession,  # noqa: TC001
) -> MagicLinkResponse:
    """Solicita magic link por e-mail.

    Retorna sempre 200 independentemente de o e-mail já existir (anti-enumeration).
    Rate limit: 10 por hora por IP (complementa rate limit por e-mail no service layer).
    """
    await send_magic_link(db=db, email=body.email)
    return MagicLinkResponse(message="Se o e-mail estiver cadastrado, você receberá um link em breve.")


@router.get("/magic/callback", response_class=RedirectResponse)
async def magic_link_callback(
    request: Request,
    token: str,
    db: DBSession,  # noqa: TC001
) -> RedirectResponse:
    """Valida magic token, autentica o usuário e redireciona."""
    try:
        access_token, refresh_token, onboarding_completed = await consume_magic_token(db=db, token=token)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    await log_event(db, MAGIC_LINK_USED, request=request)

    base_url = settings.APP_URL.rstrip("/")
    redirect_url = f"{base_url}/" if onboarding_completed else f"{base_url}/onboarding"

    response = RedirectResponse(url=redirect_url, status_code=303)
    set_auth_cookies(response, access_token, refresh_token)
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
    clear_auth_cookies(response)
    return LogoutResponse(message="Logout realizado com sucesso.")


# ── Refresh ────────────────────────────────────────────────────────────────────


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
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
    set_auth_cookies(response, new_access, new_refresh)
    return RefreshResponse(message="Tokens renovados com sucesso.")


# ── Google OAuth2 ─────────────────────────────────────────────────────────────


@router.get("/google/login", response_class=RedirectResponse)
async def google_login() -> RedirectResponse:
    """Redireciona para a tela de consentimento do Google."""
    state = secrets.token_urlsafe(32)

    redis = get_redis()
    await redis.set(f"oauth_state:{state}", "1", ex=_OAUTH_STATE_TTL)

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
    error_redirect = RedirectResponse(url=f"{base_url}/login?error=oauth_failed", status_code=303)

    if error or not code or not state:
        return error_redirect

    redis = get_redis()
    stored = await redis.get(f"oauth_state:{state}")
    if not stored:
        return error_redirect
    await redis.delete(f"oauth_state:{state}")

    try:
        access_token, refresh_token, onboarding_completed = await google_oauth_callback(code=code, db=db)
    except AuthError:
        return error_redirect

    await log_event(db, OAUTH_LOGIN, request=None)  # sem request disponível em redirect

    redirect_url = f"{base_url}/" if onboarding_completed else f"{base_url}/onboarding"
    response = RedirectResponse(url=redirect_url, status_code=303)
    set_auth_cookies(response, access_token, refresh_token)
    return response


# ── Password change ───────────────────────────────────────────────────────────


@router.patch(
    "/password",
    response_model=MessageResponse,
    summary="Alterar senha",
)
@limiter.limit("5/hour")
async def update_password(
    request: Request,
    body: ChangePasswordRequest,
    user: CurrentUser,
    db: DBSession,  # noqa: TC001
) -> MessageResponse:
    """Altera a senha de uma conta local. Rate limit: 5 por hora."""
    try:
        await change_password(
            db=db,
            user=user,
            current_password=body.current_password,
            new_password=body.new_password,
        )
    except AccountError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    await log_event(db, PASSWORD_CHANGED, user_id=user.id, request=request)
    return MessageResponse(message="Senha alterada com sucesso.")


# ── Email change ──────────────────────────────────────────────────────────────


@router.patch(
    "/email",
    response_model=MessageResponse,
    summary="Iniciar troca de e-mail",
)
@limiter.limit("3/hour")
async def update_email(
    request: Request,
    body: ChangeEmailRequest,
    user: CurrentUser,
    db: DBSession,  # noqa: TC001
) -> MessageResponse:
    """Inicia o processo de troca de e-mail. Envia confirmação para o novo e-mail."""
    try:
        redis = get_redis()
        await initiate_email_change(
            redis=redis,
            db=db,
            user=user,
            new_email=str(body.new_email),
            current_password=body.current_password,
        )
    except AccountError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return MessageResponse(message=f"E-mail de confirmação enviado para {body.new_email}.")


@router.get(
    "/email/confirm",
    response_class=RedirectResponse,
    summary="Confirmar troca de e-mail",
)
async def confirm_email(
    token: str,
    db: DBSession,  # noqa: TC001
) -> RedirectResponse:
    """Valida token de troca de e-mail e atualiza o e-mail do usuário."""
    base_url = settings.APP_URL.rstrip("/")
    try:
        redis = get_redis()
        await confirm_email_change(redis=redis, db=db, token=token)
    except AccountError:
        return RedirectResponse(url=f"{base_url}/settings/account?email_error=true", status_code=303)
    return RedirectResponse(url=f"{base_url}/settings/account?email_changed=true", status_code=303)


# ── Session management ────────────────────────────────────────────────────────


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    summary="Listar sessões ativas",
)
@limiter.limit("20/minute")
async def list_active_sessions(
    request: Request,
    user: CurrentUser,
    db: DBSession,  # noqa: TC001
    current_jti: CurrentRefreshJTI,
) -> SessionListResponse:
    """Retorna todas as sessões ativas do usuário autenticado.

    A sessão atual é marcada com is_current=True.
    """
    sessions = await list_sessions(db=db, user_id=user.id, current_jti=current_jti)
    return SessionListResponse(sessions=[SessionResponse.model_validate(s) for s in sessions])


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Revogar sessão específica",
)
@limiter.limit("10/minute")
async def revoke_specific_session(
    request: Request,
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,  # noqa: TC001
) -> dict:
    """Revoga uma sessão ativa específica pelo seu ID."""
    redis = get_redis()
    try:
        await revoke_session(db=db, redis=redis, user_id=user.id, session_id=session_id)
    except SessionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {"detail": "Sessão revogada com sucesso."}


@router.delete(
    "/sessions",
    status_code=status.HTTP_200_OK,
    summary="Revogar todas as outras sessões",
)
@limiter.limit("5/minute")
async def revoke_other_sessions(
    request: Request,
    user: CurrentUser,
    db: DBSession,  # noqa: TC001
    current_jti: CurrentRefreshJTI,
) -> dict:
    """Revoga todas as sessões ativas exceto a sessão atual.

    Requer refresh_token cookie para identificar a sessão atual.
    """
    if not current_jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cookie de refresh token ausente.",
        )
    redis = get_redis()
    count = await revoke_all_other_sessions(db=db, redis=redis, user_id=user.id, current_jti=current_jti)
    return {"detail": f"{count} sessão(ões) revogada(s) com sucesso.", "count": count}
