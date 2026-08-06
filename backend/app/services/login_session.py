"""A cauda de todo login, num lugar só.

`create_token_pair → _create_session → db.commit()` aparecia três vezes idêntica
no service de auth, e os handlers orquestravam os dois passos finais à mão — em
ordens diferentes:

    login              tokens → sessão → commit → cookies → audit
    magic_link_callback tokens → sessão → commit → audit → cookies
    google_callback     tokens → sessão → commit → audit → cookies
    refresh             tokens → cookies → (sem audit)

O que se paga por essa divergência não é elegância, são buracos no audit log.
`TOKEN_REFRESH`, `LOGOUT`, `REGISTER`, `MAGIC_LINK_SENT`, `SESSION_REVOKED` e
`ACCOUNT_LOCKED` eram constantes definidas e nunca chamadas; `google_callback`
auditava com `request=None`, então login via OAuth nunca capturava `ip_hash` nem
`user_agent`; e nenhum dos três passava `user_id`, então a linha de
`login_success` não era atribuível a ninguém.

Aqui a ordem é uma só e o motivo do login é obrigatório. O handler diz por qual
porta o usuário entrou; quem decide o resto é este módulo.

**A ordem importa.** A linha de audit entra na *mesma transação* que os tokens e
a sessão, antes do commit. Antes, o service commitava e só então o handler
escrevia a linha, que persistia no auto-commit do `get_session` — uma segunda
transação, com um instante em que a sessão existe e o registro dela não. E os
cookies vêm por último: se o commit falhar, o browser não sai com credenciais
para uma sessão que não foi gravada.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

import structlog

from app.core.cookies import clear_auth_cookies, set_auth_cookies
from app.core.security import create_token_pair
from app.services.audit import (
    LOGIN_SUCCESS,
    LOGOUT,
    MAGIC_LINK_USED,
    OAUTH_LOGIN,
    TOKEN_REFRESH,
    log_event,
)
from app.services.auth import (
    _create_session,
    blacklist_refresh_token,
    rotate_refresh_token,
)

if TYPE_CHECKING:
    import uuid

    from fastapi import Request, Response
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models.user import User

logger = structlog.get_logger(__name__)


class LoginFlow(Enum):
    """Por qual porta o usuário entrou.

    O valor é a ação do audit log. É o que torna o motivo do login um parâmetro
    obrigatório em vez de uma linha que o handler lembra (ou não) de escrever.
    """

    PASSWORD = LOGIN_SUCCESS
    MAGIC_LINK = MAGIC_LINK_USED
    GOOGLE_OAUTH = OAUTH_LOGIN


async def establish_session(
    *,
    db: AsyncSession,
    response: Response,
    request: Request,
    user: User,
    flow: LoginFlow,
) -> None:
    """Estabelece a sessão inteira depois de a identidade já ter sido provada.

    Tokens, registro de sessão, linha de audit, commit, cookies — nessa ordem.
    Quem chama já autenticou; aqui não há decisão sobre *se* o usuário entra.
    """
    user_agent = request.headers.get("User-Agent")
    client_ip = request.client.host if request.client else None

    access_token, refresh_token = create_token_pair(
        str(user.id),
        onboarding_completed=user.onboarding_completed,
    )

    await _create_session(db, user.id, refresh_token, user_agent, client_ip)
    await log_event(db, flow.value, user_id=user.id, request=request)
    await db.commit()

    set_auth_cookies(response, access_token, refresh_token)
    logger.info("session_established", user_id=str(user.id), flow=flow.name)


async def renew_session(
    *,
    db: AsyncSession,
    response: Response,
    request: Request,
    refresh_token: str,
) -> None:
    """Roda a rotação do refresh token e deixa rastro dela.

    O `db` é o que faltava: `rotate_refresh_token(token, db=None)` atualizava
    `last_active_at` e o `refresh_token_jti` da sessão quando recebia um, e o
    endpoint chamava sem — o trecho nunca rodava pelo caminho HTTP.
    """
    new_access, new_refresh = await rotate_refresh_token(refresh_token, db=db)

    await log_event(db, TOKEN_REFRESH, request=request)
    await db.commit()

    set_auth_cookies(response, new_access, new_refresh)


async def end_session(
    *,
    db: AsyncSession,
    response: Response,
    request: Request,
    refresh_token: str | None,
    user_id: uuid.UUID | None = None,
) -> None:
    """Invalida o refresh token, registra a saída e limpa os cookies.

    Os cookies são limpos mesmo sem token: o usuário pediu para sair, e deixar
    credenciais no browser porque não havia o que blacklistar seria pior.
    """
    if refresh_token:
        await blacklist_refresh_token(refresh_token)

    await log_event(db, LOGOUT, user_id=user_id, request=request)
    await db.commit()

    clear_auth_cookies(response)
