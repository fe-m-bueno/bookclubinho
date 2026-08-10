"""Personal access tokens — criar, listar, revogar e resolver.

O token em claro existe uma vez só, no retorno de `create_token`. Depois disso
só há o hash: nem esta camada nem o banco conseguem recuperá-lo.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select

from app.core.exceptions import ServiceError
from app.core.rls import auth_lookup
from app.core.security import (
    PAT_PREFIX,
    generate_personal_access_token,
    hash_personal_access_token,
    personal_access_token_prefix,
)
from app.db.models.personal_access_token import PersonalAccessToken

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

# Teto por usuário. Não é limite de recurso — é para que a lista continue
# auditável: ninguém revoga o token certo numa lista de duzentos.
MAX_TOKENS_PER_USER = 20

# `last_used_at` serve para o usuário reconhecer token morto, não para métrica.
# Sem essa folga, toda requisição autenticada por Bearer viraria um UPDATE.
_LAST_USED_THROTTLE = timedelta(minutes=5)


class PATError(ServiceError):
    pass


async def create_token(
    db: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    expires_in_days: int | None = None,
) -> tuple[PersonalAccessToken, str]:
    """Cria um token e devolve (linha, token em claro).

    O token em claro é a única coisa que o chamador precisa mostrar ao usuário,
    e a única chance de fazê-lo.
    """
    # `count()` no servidor em vez de contar as linhas aqui: só o número precisa
    # atravessar a rede, e é o que o SAST do CI cobra.
    active = await db.execute(
        select(func.count())
        .select_from(PersonalAccessToken)
        .where(
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.revoked_at.is_(None),
        )
    )
    if (active.scalar_one() or 0) >= MAX_TOKENS_PER_USER:
        raise PATError(
            f"Limite de {MAX_TOKENS_PER_USER} tokens ativos atingido. Revogue algum antes de criar outro.",
            status_code=409,
        )

    raw = generate_personal_access_token()
    token = PersonalAccessToken(
        user_id=user_id,
        name=name,
        token_hash=hash_personal_access_token(raw),
        prefix=personal_access_token_prefix(raw),
        expires_at=(datetime.now(UTC) + timedelta(days=expires_in_days)) if expires_in_days else None,
    )
    db.add(token)
    await db.flush()
    logger.info("pat_created", user_id=str(user_id), token_id=str(token.id))
    return token, raw


async def list_tokens(db: AsyncSession, user_id: uuid.UUID) -> list[PersonalAccessToken]:
    """Tokens não revogados do usuário, mais recentes primeiro."""
    result = await db.execute(
        select(PersonalAccessToken)
        .where(
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.revoked_at.is_(None),
        )
        .order_by(PersonalAccessToken.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_token(db: AsyncSession, user_id: uuid.UUID, token_id: uuid.UUID) -> None:
    """Revoga um token do próprio usuário. 404 se não existir ou já estar revogado."""
    result = await db.execute(
        select(PersonalAccessToken).where(
            PersonalAccessToken.id == token_id,
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.revoked_at.is_(None),
        )
    )
    token = result.scalar_one_or_none()
    if token is None:
        raise PATError("Token não encontrado.", status_code=404)
    token.revoked_at = datetime.now(UTC)
    logger.info("pat_revoked", user_id=str(user_id), token_id=str(token_id))


async def resolve_token(db: AsyncSession, raw: str) -> uuid.UUID | None:
    """Devolve o `user_id` dono do token, ou None se ele não vale.

    Não distingue os motivos da recusa — inexistente, revogado e expirado saem
    todos como None. Quem chama devolve 401 genérico.
    """
    if not raw.startswith(PAT_PREFIX):
        # Recusa sem ir ao banco: um Authorization que não tem nossa cara não é
        # um PAT, e não vale um SELECT por requisição.
        return None

    # A porta da 0025, aberta pelo tempo exato do lookup: aqui não há usuário no
    # contexto ainda — é justamente isto que vai descobrir qual ele é — e a
    # requisição segue por uma rota qualquer, que não tem por que continuar com
    # a tabela legível inteira depois.
    async with auth_lookup(db):
        result = await db.execute(
            select(PersonalAccessToken).where(
                PersonalAccessToken.token_hash == hash_personal_access_token(raw),
                PersonalAccessToken.revoked_at.is_(None),
            )
        )
        token = result.scalar_one_or_none()
    if token is None:
        return None

    now = datetime.now(UTC)
    if token.expires_at is not None and token.expires_at <= now:
        return None

    if token.last_used_at is None or (now - token.last_used_at) > _LAST_USED_THROTTLE:
        token.last_used_at = now

    return token.user_id
