"""Round business logic — create, list, update status, delete, nominations, voting."""

from __future__ import annotations

import secrets
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import structlog
from redis.exceptions import RedisError
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.round import NominationCreateRequest

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.book_review import BookReview
from app.db.models.group import Group, GroupMember, GroupRole
from app.db.models.round import Round, RoundNomination, RoundStatus, RoundVote
from app.security.sanitizer import sanitize

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


# ── Private helpers ───────────────────────────────────────────────────────────


async def _fetch_round_and_member(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    load_nominations_and_votes: bool = False,
) -> tuple[Round, GroupMember]:
    """Fetch a round and verify the user is a member of its group.

    Returns 404 if the round doesn't exist or the user is not a member.
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

    return round_, member


async def _fetch_round_with_nominations_and_votes(
    db: AsyncSession, round_id: uuid.UUID
) -> Round:
    """Re-fetch a round with nominations+votes after a flush. No membership check."""
    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.nominations).selectinload(RoundNomination.votes))
    )
    return result.scalar_one()


def _require_status(round_: Round, expected: RoundStatus, phase_label: str) -> None:
    """Raise RoundError(409) when round is not in the expected status."""
    if round_.status != expected:
        raise RoundError(
            f"Rodada está em '{round_.status}', não em fase de {phase_label}.",
            status_code=409,
        )


# ── Public access helpers ─────────────────────────────────────────────────────


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
    """
    round_, member = await _fetch_round_and_member(
        db, round_id, user_id, load_nominations_and_votes=load_nominations_and_votes
    )
    if member.role != GroupRole.ADMIN:
        raise RoundError(
            "Apenas administradores podem realizar esta ação.", status_code=403
        )
    return round_


async def verify_round_member(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    load_nominations_and_votes: bool = False,
) -> Round:
    """Fetch round and verify the user is a member of its group.

    Returns 404 if the round doesn't exist or user is not a member.
    Any group member (including admins) passes this check.
    """
    round_, _ = await _fetch_round_and_member(
        db, round_id, user_id, load_nominations_and_votes=load_nominations_and_votes
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


# ── Nominations ───────────────────────────────────────────────────────────────


async def add_nomination(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    data: NominationCreateRequest,
) -> tuple[RoundNomination, Round]:
    """Add a book nomination. Max 3 per user. Status must be NOMINATING.

    Returns (nomination, refreshed_round) so callers avoid a redundant re-fetch.
    """
    round_ = await verify_round_member(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.NOMINATING, "indicação")

    # Single-pass: count user's nominations and check for duplicate book
    user_count = 0
    is_duplicate = False
    for n in round_.nominations:
        if n.user_id == user_id:
            user_count += 1
            if n.book_id == data.book_id:
                is_duplicate = True

    if user_count >= 3:
        raise RoundError("Máximo de 3 indicações por rodada.", status_code=409)
    if is_duplicate:
        raise RoundError("Você já indicou este livro nesta rodada.", status_code=409)

    nomination = RoundNomination(
        round_id=round_id,
        user_id=user_id,
        book_id=data.book_id,
        book_title=sanitize(data.book_title),
        book_author=sanitize(data.book_author) if data.book_author else None,
        book_cover_url=data.book_cover_url,
        book_hardcover_slug=data.book_hardcover_slug,
        book_page_count=data.book_page_count,
        pitch=sanitize(data.pitch) if data.pitch else None,
    )
    db.add(nomination)
    await db.flush()

    logger.info(
        "nomination_added",
        round_id=str(round_id),
        user_id=str(user_id),
        book_id=data.book_id,
    )
    refreshed = await _fetch_round_with_nominations_and_votes(db, round_id)
    return nomination, refreshed


async def remove_nomination(
    db: AsyncSession,
    round_id: uuid.UUID,
    nomination_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Remove a nomination. User can only remove their own. Status must be NOMINATING."""
    round_ = await verify_round_member(db, round_id, user_id)
    _require_status(round_, RoundStatus.NOMINATING, "indicação")

    nom_result = await db.execute(
        select(RoundNomination).where(
            RoundNomination.id == nomination_id,
            RoundNomination.round_id == round_id,
        )
    )
    nomination = nom_result.scalar_one_or_none()
    if nomination is None:
        raise RoundError("Indicação não encontrada.", status_code=404)

    if nomination.user_id != user_id:
        raise RoundError(
            "Você só pode remover suas próprias indicações.", status_code=403
        )

    await db.delete(nomination)
    logger.info(
        "nomination_removed",
        round_id=str(round_id),
        nomination_id=str(nomination_id),
        user_id=str(user_id),
    )


# ── Voting ────────────────────────────────────────────────────────────────────


async def start_voting(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Round:
    """Transition round from NOMINATING to VOTING. Requires at least 2 nominations."""
    round_ = await verify_round_admin(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.NOMINATING, "indicação")

    if len(round_.nominations) < 2:
        raise RoundError(
            "São necessárias pelo menos 2 indicações para iniciar a votação.",
            status_code=422,
        )

    round_.status = RoundStatus.VOTING
    round_.started_at = datetime.now(UTC)

    logger.info("voting_started", round_id=str(round_id))
    return round_


async def cast_vote(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    nomination_id: uuid.UUID,
) -> tuple[RoundVote, Round]:
    """Cast or change a vote. Changing vote = delete old + insert new (RLS blocks UPDATE).

    Returns (vote, refreshed_round) so callers avoid a redundant re-fetch.
    """
    round_ = await verify_round_member(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.VOTING, "votação")

    valid_nom_ids = {n.id for n in round_.nominations}
    if nomination_id not in valid_nom_ids:
        raise RoundError("Indicação não encontrada nesta rodada.", status_code=404)

    # Check for existing vote — must DELETE before INSERT (RLS blocks UPDATE)
    existing_result = await db.execute(
        select(RoundVote).where(
            RoundVote.round_id == round_id,
            RoundVote.user_id == user_id,
        )
    )
    existing_vote = existing_result.scalar_one_or_none()
    if existing_vote is not None:
        await db.delete(existing_vote)
        await db.flush()

    vote = RoundVote(
        round_id=round_id,
        user_id=user_id,
        nomination_id=nomination_id,
    )
    db.add(vote)
    await db.flush()

    logger.info(
        "vote_cast",
        round_id=str(round_id),
        user_id=str(user_id),
        nomination_id=str(nomination_id),
    )
    refreshed = await _fetch_round_with_nominations_and_votes(db, round_id)
    return vote, refreshed


# ── Finalize ──────────────────────────────────────────────────────────────────


async def finalize_round(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    deadline: date | None = None,
) -> Round:
    """Count votes, resolve ties, set book fields, transition to READING."""
    round_ = await verify_round_admin(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.VOTING, "votação")

    if not round_.nominations:
        raise RoundError("Nenhuma indicação registrada.", status_code=422)

    # Validate deadline before any mutations
    if deadline is not None and deadline <= date.today():
        raise RoundError("O prazo deve ser uma data futura.", status_code=422)

    vote_result = await db.execute(
        select(RoundVote.nomination_id, func.count())
        .where(RoundVote.round_id == round_id)
        .group_by(RoundVote.nomination_id)
    )
    vote_counts: dict[uuid.UUID, int] = dict(vote_result.all())

    if not vote_counts:
        raise RoundError("Nenhum voto registrado.", status_code=422)

    max_votes = max(vote_counts.values())
    tied = [n for n in round_.nominations if vote_counts.get(n.id, 0) == max_votes]

    was_tiebreak = len(tied) > 1
    winner = secrets.choice(tied) if was_tiebreak else tied[0]

    round_.tiebreak_info = {
        "was_tiebreak": was_tiebreak,
        "tied_nominations": [
            {"id": str(n.id), "title": n.book_title, "votes": vote_counts.get(n.id, 0)}
            for n in tied
        ],
        "winner_id": str(winner.id),
        **({"method": "random"} if was_tiebreak else {}),
    }

    round_.book_id = winner.book_id
    round_.book_title = winner.book_title
    round_.book_author = winner.book_author
    round_.book_cover_url = winner.book_cover_url
    round_.book_page_count = winner.book_page_count

    if winner.book_hardcover_slug:
        from app.services.hardcover import HardcoverClient

        client = HardcoverClient()
        try:
            detail = await client.get_book(winner.book_hardcover_slug)
            if detail:
                round_.book_genres = detail.genres
        finally:
            await client.aclose()

    round_.status = RoundStatus.READING

    if deadline is not None:
        round_.deadline = deadline

    logger.info(
        "round_finalized",
        round_id=str(round_id),
        winner_book=winner.book_title,
        had_tiebreak=was_tiebreak,
    )

    try:
        redis = get_redis()
        await redis.xadd(
            f"bookclub:group:{round_.group_id}:events",
            {
                "type": "round_finalized",
                "round_id": str(round_.id),
                "book_title": winner.book_title or "",
                "was_tiebreak": str(was_tiebreak).lower(),
            },
            maxlen=10000,
            approximate=True,
        )
    except RedisError:
        logger.warning("redis_event_emission_failed", round_id=str(round_id))

    return round_


# ── Review phase ──────────────────────────────────────────────────────────────


async def start_review(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Round:
    """Transition round from READING to REVIEWING."""
    round_ = await verify_round_admin(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.READING, "leitura")

    round_.status = RoundStatus.REVIEWING

    logger.info("review_phase_started", round_id=str(round_id))
    return round_


async def finish_round(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Round:
    """Transition round to FINISHED. Requires at least 1 submitted review."""
    round_ = await verify_round_admin(
        db, round_id, user_id, load_nominations_and_votes=True
    )
    _require_status(round_, RoundStatus.REVIEWING, "reviews")

    review_count_result = await db.execute(
        select(func.count()).select_from(BookReview).where(
            BookReview.round_id == round_id
        )
    )
    review_count: int = review_count_result.scalar_one()
    if review_count == 0:
        raise RoundError(
            "Pelo menos uma review deve ser submetida antes de encerrar a rodada.",
            status_code=422,
        )

    round_.status = RoundStatus.FINISHED
    round_.finished_at = datetime.now(UTC)

    logger.info("round_finished", round_id=str(round_id))
    return round_
