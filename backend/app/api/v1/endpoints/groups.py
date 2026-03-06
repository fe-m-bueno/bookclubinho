"""
GET  /api/v1/groups/validate/{code} — validar código de convite
POST /api/v1/groups/join             — entrar em um grupo via código
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DBSession  # noqa: TC001
from app.schemas.group import (
    GroupJoinRequest,
    GroupJoinResponse,
    GroupValidateResponse,
)
from app.services.group import (
    GroupError,
    join_group,
    validate_group_code,
)

router = APIRouter(tags=["groups"])


@router.get(
    "/validate/{code}",
    response_model=GroupValidateResponse,
    summary="Validar código de convite",
)
async def validate_code(
    code: str, db: DBSession, user: CurrentUser
) -> GroupValidateResponse:
    """Verifica se um código de convite é válido e retorna dados do grupo."""
    try:
        group = await validate_group_code(db=db, code=code)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return GroupValidateResponse(
        name=group.name,
        photo_url=group.photo_url,
        member_count=len(group.members),
    )


@router.post(
    "/join",
    response_model=GroupJoinResponse,
    summary="Entrar em um grupo via código",
)
async def join_group_endpoint(
    body: GroupJoinRequest, db: DBSession, user: CurrentUser
) -> GroupJoinResponse:
    """Adiciona o usuário autenticado a um grupo via código de convite."""
    try:
        group = await join_group(db=db, user=user, invite_code=body.invite_code)
    except GroupError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return GroupJoinResponse(message="Você entrou no clube!", group_id=str(group.id))
