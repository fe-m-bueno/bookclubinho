"""Round business logic — create, list, update status, delete."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.group import Group, GroupMember, GroupRole
from app.db.models.round import Round, RoundNomination, RoundStatus

logger = structlog.get_logger(__name__)

VALID_TRANSITIONS: dict[RoundStatus, list[RoundStatus]] = {
    RoundStatus.NOMINATING: [RoundStatus.VOTING],
    RoundStatus.VOTING: [RoundStatus.READING],
    RoundStatus.READING: [RoundStatus.REVIEWING],
    RoundStatus.REVIEWING: [RoundStatus.FINISHED],
    RoundStatus.FINISHED: [],
}


class RoundError(ServiceError):
    """Raised when round validation fails."""


# ── Helpers ───────────────────────────────────────────────────────────────────


async def verify_round_admin(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    load_nominations_and_votes: bool = False,
) -> Round:
    """Fetch round and verify the user is an admin of its group.

    Returns 404 if the round doesn't exist or user is not a member.
    Returns 403 if user is a member but not admin.

    Pass ``load_nominations_and_votes=True`` when the caller needs the full
    nominations + votes graph (e.g. for returning a RoundDetailResponse).
    """
    stmt = select(Round).where(Round.id == round_id)
    if load_nominations_and_votes:
        stmt = stmt.options(
            selectinload(Round.nominations).selectinload(RoundNomination.votes)
        )
    result = await db.execute(stmt)
    round_ = result.scalar_one_or_none()
    if round_ is None:
        raise RoundError("Rodada não encontrada.", status_code=404)

    member_result = await db.execute(
        select(GroupMember)
        .join(Group, GroupMember.group_id == Group.id)
        .where(
            GroupMember.user_id == user_id,
            GroupMember.group_id == round_.group_id,
            Group.is_active.is_(True),
        )
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        raise RoundError("Rodada não encontrada.", status_code=404)

    if member.role != GroupRole.ADMIN:
        raise RoundError(
            "Apenas administradores podem realizar esta ação.", status_code=403
        )

    return round_


# ── CRUD ──────────────────────────────────────────────────────────────────────


async def create_round(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    deadline: date | None = None,
) -> Round:
    """Create a new round for the group. Fails if an active round already exists."""
    active_result = await db.execute(
        select(Round.id).where(
            Round.group_id == group_id,
            Round.status != RoundStatus.FINISHED,
        )
    )
    if active_result.scalar_one_or_none() is not None:
        raise RoundError("Já existe uma rodada ativa neste clube.", status_code=409)

    if deadline is not None and deadline <= date.today():
        raise RoundError("O prazo deve ser uma data futura.", status_code=422)

    max_result = await db.execute(
        select(func.max(Round.round_number)).where(Round.group_id == group_id)
    )
    max_number: int | None = max_result.scalar_one_or_none()
    next_number = (max_number or 0) + 1

    round_ = Round(
        group_id=group_id,
        round_number=next_number,
        status=RoundStatus.NOMINATING,
        deadline=deadline,
        created_by=user_id,
    )
    db.add(round_)
    await db.flush()

    logger.info("round_created", group_id=str(group_id), round_number=next_number)
    return round_


async def list_rounds(
    db: AsyncSession,
    group_id: uuid.UUID,
    cursor: int | None = None,
    limit: int = 10,
) -> tuple[list[Round], int | None]:
    """List rounds for a group with cursor-based pagination (by round_number DESC)."""
    query = (
        select(Round)
        .where(Round.group_id == group_id)
        .options(selectinload(Round.nominations))
        .order_by(Round.round_number.desc())
        .limit(limit + 1)
    )
    if cursor is not None:
        query = query.where(Round.round_number < cursor)

    result = await db.execute(query)
    rounds = list(result.scalars().all())

    next_cursor: int | None = None
    if len(rounds) > limit:
        rounds = rounds[:limit]
        next_cursor = rounds[-1].round_number

    return rounds, next_cursor


async def get_current_round(db: AsyncSession, group_id: uuid.UUID) -> Round | None:
    """Return the active (non-finished) round for a group, with nominations and votes."""
    result = await db.execute(
        select(Round)
        .where(Round.group_id == group_id, Round.status != RoundStatus.FINISHED)
        .options(
            selectinload(Round.nominations).selectinload(RoundNomination.votes)
        )
    )
    return result.scalar_one_or_none()


async def update_round(
    db: AsyncSession,
    round_: Round,
    deadline: date | None = None,
    new_status: RoundStatus | None = None,
) -> Round:
    """Update mutable round fields. Validates status transitions."""
    if deadline is None and new_status is None:
        raise RoundError("Informe ao menos um campo para atualizar.", status_code=422)

    if new_status is not None:
        # Explicit 409 for "already finished" — distinct from 422 transition errors.
        if round_.status == RoundStatus.FINISHED:
            raise RoundError("Rodada já finalizada.", status_code=409)

        allowed = VALID_TRANSITIONS.get(round_.status, [])
        if new_status not in allowed:
            raise RoundError(
                f"Transição de '{round_.status}' para '{new_status}' não é permitida.",
                status_code=422,
            )

        round_.status = new_status
        if new_status == RoundStatus.FINISHED:
            round_.finished_at = datetime.now(UTC)

    if deadline is not None:
        if deadline <= date.today():
            raise RoundError("O prazo deve ser uma data futura.", status_code=422)
        round_.deadline = deadline

    logger.info("round_updated", round_id=str(round_.id), new_status=new_status)
    return round_


async def delete_round(db: AsyncSession, round_: Round) -> None:
    """Hard-delete a round. Only allowed when status is NOMINATING."""
    if round_.status != RoundStatus.NOMINATING:
        raise RoundError(
            "Apenas rodadas em fase de indicação podem ser removidas.", status_code=409
        )

    await db.delete(round_)
    logger.info("round_deleted", round_id=str(round_.id))
