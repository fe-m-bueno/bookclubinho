"""Single source of truth for "does this user belong to this club, and how?".

Every membership and role assertion in the app crosses this module's interface:
`app.core.deps` exposes it as a FastAPI dependency for routes with `group_id` in
the path, and the services call `resolve` directly. Keeping the query in one
place is what makes the `Group.is_active` filter impossible to forget — before
this module existed, two of the four copies omitted it and let members write to
soft-deleted clubs.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.exceptions import ServiceError
from app.db.models.group import Group, GroupMember, GroupRole

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

DEFAULT_NOT_FOUND_MESSAGE = "Clube não encontrado."

_ROLE_DENIED_MESSAGES = {
    GroupRole.ADMIN: "Apenas administradores podem realizar esta ação.",
}
_ROLE_DENIED_FALLBACK = "Você não tem permissão para realizar esta ação."


class MembershipError(ServiceError):
    """Raised when the user is not a member, or lacks the required role."""


async def resolve(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    require_role: GroupRole | None = None,
    not_found_message: str = DEFAULT_NOT_FOUND_MESSAGE,
) -> GroupMember:
    """Return the user's GroupMember row for an active group.

    Raises MembershipError 404 when the user is not a member or the group is
    soft-deleted, so the response never reveals that the group exists. Callers
    that need to hide a different resource pass ``not_found_message`` — the
    round endpoints say "Rodada não encontrada." so probing a round_id can't
    distinguish "no such round" from "round in a club that isn't yours".

    Raises MembershipError 403 when the user is a member but ``require_role``
    doesn't match: membership is already established at that point, so there is
    nothing left to hide.
    """
    result = await db.execute(
        select(GroupMember)
        .join(Group, GroupMember.group_id == Group.id)
        .where(
            GroupMember.user_id == user_id,
            GroupMember.group_id == group_id,
            Group.is_active.is_(True),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise MembershipError(not_found_message, status_code=404)

    if require_role is not None and member.role != require_role:
        raise MembershipError(
            _ROLE_DENIED_MESSAGES.get(require_role, _ROLE_DENIED_FALLBACK),
            status_code=403,
        )

    return member
