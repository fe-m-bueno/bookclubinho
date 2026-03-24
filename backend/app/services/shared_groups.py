"""Shared groups service — find groups two users have in common."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import aliased

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.group import Group, GroupMember


async def get_shared_groups(
    db: AsyncSession,
    viewer_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> list[dict]:
    """Return groups that both viewer and target_user are active members of."""
    viewer_member = aliased(GroupMember)
    target_member = aliased(GroupMember)

    # Correlated subquery counts members without creating a Cartesian product
    member_count_subq = (
        select(func.count())
        .select_from(GroupMember)
        .where(GroupMember.group_id == Group.id)
        .correlate(Group)
        .scalar_subquery()
    )

    result = await db.execute(
        select(
            Group.id,
            Group.name,
            Group.photo_url,
            member_count_subq.label("member_count"),
        )
        .join(viewer_member, viewer_member.group_id == Group.id)
        .join(target_member, target_member.group_id == Group.id)
        .where(
            viewer_member.user_id == viewer_id,
            target_member.user_id == target_user_id,
            Group.is_active.is_(True),
        )
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "photo_url": row.photo_url,
            "member_count": row.member_count,
        }
        for row in result
    ]
