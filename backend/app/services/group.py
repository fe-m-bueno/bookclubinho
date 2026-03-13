"""Group business logic — validate invite code, join group."""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.db.models.user import User

from app.db.models.group import Group, GroupMember

logger = structlog.get_logger(__name__)


class GroupError(Exception):
    """Raised when group validation fails."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


async def validate_group_code(db: AsyncSession, code: str) -> Group:
    """Busca grupo pelo invite_code. Raise GroupError(404) se não encontrar."""
    result = await db.execute(
        select(Group)
        .where(Group.invite_code == code.upper())
        .options(selectinload(Group.members))
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise GroupError("Clube não encontrado.", status_code=404)
    return group


async def join_group(db: AsyncSession, user: User, invite_code: str) -> Group:
    """Adiciona usuário ao grupo. Valida: existe, não é membro, não está cheio."""
    group = await validate_group_code(db, invite_code)

    is_member = any(m.user_id == user.id for m in group.members)
    if is_member:
        raise GroupError("Você já faz parte deste clube.", status_code=409)

    if len(group.members) >= group.max_members:
        raise GroupError("Este clube está cheio.", status_code=403)

    member = GroupMember(user_id=user.id, group_id=group.id, role="member")
    db.add(member)

    logger.info("group_joined", user_id=str(user.id), group_id=str(group.id))
    return group
