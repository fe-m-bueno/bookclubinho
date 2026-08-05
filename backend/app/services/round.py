"""Round business logic — create, list, update status, delete, nominations, voting."""

from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import structlog
from redis.exceptions import RedisError
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.after_commit import AfterCommit
    from app.schemas.round import NominationCreateRequest

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.book_review import BookReview
from app.db.models.group import GroupMember, GroupRole
from app.db.models.round import Round, RoundNomination, RoundStatus, RoundVote
from app.security.sanitizer import sanitize
from app.services import membership
from app.services.badge_checker import check_and_award_badges
from app.services.shelf import populate_shelf_cache
from app.services.stats import invalidate_group_stats

logger = structlog.get_logger(__name__)


class RoundError(ServiceError):
    """Raised when round validation fails."""


# ── The state machine ─────────────────────────────────────────────────────────
#
# One table, read top to bottom, is the whole machine:
#
#     nominating → voting → reading → reviewing → finished
#
# A guard is part of a transition's *legality*, not a side effect of it —
# starting a vote with one nomination isn't a valid transition missing a step,
# it's an illegal transition. So guards live here, next to the pair they gate.
# What a transition *causes* (book fields, badges, cache, events) belongs to the
# named function that performs it.


async def _require_two_nominations(db: AsyncSession, round_: Round) -> None:
    if len(round_.nominations) < 2:
        raise RoundError(
            "São necessárias pelo menos 2 indicações para iniciar a votação.",
            status_code=422,
        )


async def _require_votes(db: AsyncSession, round_: Round) -> None:
    if not round_.nominations:
        raise RoundError("Nenhuma indicação registrada.", status_code=422)
    if not any(n.votes for n in round_.nominations):
        raise RoundError("Nenhum voto registrado.", status_code=422)


async def _require_one_review(db: AsyncSession, round_: Round) -> None:
    result = await db.execute(select(func.count()).select_from(BookReview).where(BookReview.round_id == round_.id))
    if result.scalar_one() == 0:
        raise RoundError(
            "Pelo menos uma review deve ser submetida antes de encerrar a rodada.",
            status_code=422,
        )


# AsyncSession is quoted: it only exists under TYPE_CHECKING, and this alias
# is evaluated at runtime.
Guard = Callable[["AsyncSession", Round], Awaitable[None]]

TRANSITIONS: dict[tuple[RoundStatus, RoundStatus], Guard | None] = {
    (RoundStatus.NOMINATING, RoundStatus.VOTING): _require_two_nominations,
    (RoundStatus.VOTING, RoundStatus.READING): _require_votes,
    (RoundStatus.READING, RoundStatus.REVIEWING): None,
    (RoundStatus.REVIEWING, RoundStatus.FINISHED): _require_one_review,
}

# Removing a round isn't a transition — the round stops existing. Only allowed
# before voting opens, so a club never loses the record of what it read.
DELETABLE_FROM = frozenset({RoundStatus.NOMINATING})

_ILLEGAL = object()


async def _advance(db: AsyncSession, round_: Round, to: RoundStatus) -> None:
    """Move the round to `to`, refusing anything the table doesn't allow.

    Every transition goes through here. Before this existed the table was
    consulted by one function and the other four wrote `round_.status = X` by
    hand, so the machine had two encodings that nothing kept in sync.
    """
    guard = TRANSITIONS.get((round_.status, to), _ILLEGAL)
    if guard is _ILLEGAL:
        # 409, not 422: the request is well-formed, the round is just in the
        # wrong state for it. Matches what the old _require_status returned.
        raise RoundError(
            f"Transição de '{round_.status}' para '{to}' não é permitida.",
            status_code=409,
        )
    # Guards raise 422: the transition is legal, its precondition isn't met.
    if guard is not None:
        await guard(db, round_)

    round_.status = to


# ── Private helpers ───────────────────────────────────────────────────────────


async def _fetch_round_and_member(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    load_nominations_and_votes: bool = False,
    require_role: GroupRole | None = None,
) -> tuple[Round, GroupMember]:
    """Fetch a round and verify the user is a member of its group.

    Returns 404 if the round doesn't exist or the user is not a member.
    """
    stmt = select(Round).where(Round.id == round_id)
    if load_nominations_and_votes:
        stmt = stmt.options(selectinload(Round.nominations).selectinload(RoundNomination.votes))
    result = await db.execute(stmt)
    round_ = result.scalar_one_or_none()
    if round_ is None:
        raise RoundError("Rodada não encontrada.", status_code=404)

    # "Rodada não encontrada." on purpose: with the club's own message here,
    # probing round_ids would distinguish "no such round" from "round in a club
    # that isn't yours".
    member = await membership.resolve(
        db,
        round_.group_id,
        user_id,
        require_role=require_role,
        not_found_message="Rodada não encontrada.",
    )
    return round_, member


async def _fetch_round_with_nominations_and_votes(db: AsyncSession, round_id: uuid.UUID) -> Round:
    """Re-fetch a round with nominations+votes after a flush. No membership check."""
    result = await db.execute(
        select(Round)
        .where(Round.id == round_id)
        .options(selectinload(Round.nominations).selectinload(RoundNomination.votes))
    )
    return result.scalar_one()


def _require_phase(round_: Round, expected: RoundStatus, phase_label: str) -> None:
    """Raise RoundError(409) when the round isn't in the phase an action needs.

    Distinct from the transition table: this gates actions that happen *within* a
    phase (nominating a book, casting a vote) and don't move the round anywhere.
    """
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
    round_, _member = await _fetch_round_and_member(
        db,
        round_id,
        user_id,
        load_nominations_and_votes=load_nominations_and_votes,
        require_role=GroupRole.ADMIN,
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

    max_result = await db.execute(select(func.max(Round.round_number)).where(Round.group_id == group_id))
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
        .options(selectinload(Round.nominations).selectinload(RoundNomination.votes))
    )
    return result.scalar_one_or_none()


async def update_round(
    db: AsyncSession,
    round_: Round,
    deadline: date | None = None,
) -> Round:
    """Update the round's deadline.

    Status is deliberately not settable here. It used to be, and it bypassed
    every guard: PATCH with status="reading" from VOTING moved the round on with
    no votes and, worse, without the book fields that only finalize_round writes
    — leaving a round in reading phase with book_id = None. Transitioning is what
    the named actions are for.
    """
    if deadline is None:
        raise RoundError("Informe ao menos um campo para atualizar.", status_code=422)

    if deadline <= date.today():
        raise RoundError("O prazo deve ser uma data futura.", status_code=422)
    round_.deadline = deadline

    logger.info("round_updated", round_id=str(round_.id), deadline=str(deadline))
    return round_


async def delete_round(db: AsyncSession, round_: Round) -> None:
    """Hard-delete a round. See DELETABLE_FROM."""
    if round_.status not in DELETABLE_FROM:
        raise RoundError("Apenas rodadas em fase de indicação podem ser removidas.", status_code=409)

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
    round_ = await verify_round_member(db, round_id, user_id, load_nominations_and_votes=True)
    _require_phase(round_, RoundStatus.NOMINATING, "indicação")

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
    _require_phase(round_, RoundStatus.NOMINATING, "indicação")

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
        raise RoundError("Você só pode remover suas próprias indicações.", status_code=403)

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
    """Open voting. See TRANSITIONS for the guard."""
    round_ = await verify_round_admin(db, round_id, user_id, load_nominations_and_votes=True)

    await _advance(db, round_, RoundStatus.VOTING)
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
    round_ = await verify_round_member(db, round_id, user_id, load_nominations_and_votes=True)
    _require_phase(round_, RoundStatus.VOTING, "votação")

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
    round_ = await verify_round_admin(db, round_id, user_id, load_nominations_and_votes=True)

    # Validate the deadline before any mutation, including the transition.
    if deadline is not None and deadline <= date.today():
        raise RoundError("O prazo deve ser uma data futura.", status_code=422)

    # The guard for this pair (>= 1 nomination, >= 1 vote) lives in TRANSITIONS;
    # _advance runs it before the status moves.
    await _advance(db, round_, RoundStatus.READING)

    # Votes come from the relationship verify_round_admin already eager-loaded.
    # This used to be a separate GROUP BY, so the same rows were read twice and
    # the guard and the tiebreak could disagree about them.
    vote_counts: dict[uuid.UUID, int] = {n.id: len(n.votes) for n in round_.nominations}

    max_votes = max(vote_counts.values())
    tied = [n for n in round_.nominations if vote_counts.get(n.id, 0) == max_votes]

    was_tiebreak = len(tied) > 1
    winner = secrets.choice(tied) if was_tiebreak else tied[0]

    round_.tiebreak_info = {
        "was_tiebreak": was_tiebreak,
        "tied_nominations": [{"id": str(n.id), "title": n.book_title, "votes": vote_counts.get(n.id, 0)} for n in tied],
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
    """Open the review phase. See TRANSITIONS."""
    round_ = await verify_round_admin(db, round_id, user_id, load_nominations_and_votes=True)

    await _advance(db, round_, RoundStatus.REVIEWING)

    logger.info("review_phase_started", round_id=str(round_id))
    return round_


async def finish_round(
    db: AsyncSession,
    round_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    after_commit: AfterCommit,
) -> Round:
    """Transition round to FINISHED. Requires at least 1 submitted review.

    Finishing the round means everyone in the club finished the book, so the
    `book_finished` badges are re-checked for every member — not just the admin
    who pressed the button. That fan-out used to live in the endpoint, where a
    second caller (a cron, a CLI) would have skipped it entirely.
    """
    round_ = await verify_round_admin(db, round_id, user_id, load_nominations_and_votes=True)

    await _advance(db, round_, RoundStatus.FINISHED)
    round_.finished_at = datetime.now(UTC)

    badge_payload = {"group_id": str(round_.group_id), "round_id": str(round_id)}
    members_result = await db.execute(select(GroupMember.user_id).where(GroupMember.group_id == round_.group_id))
    for (member_id,) in members_result.all():
        after_commit.schedule(
            check_and_award_badges,
            str(member_id),
            "book_finished",
            badge_payload,
        )

    # Stats and the public shelf are derived from finished rounds, so both go
    # stale the moment this transition happens. Owning them here means a second
    # caller — a cron, a CLI — can't leave them serving old data.
    await invalidate_group_stats(round_.group_id)
    after_commit.schedule(populate_shelf_cache, round_.group_id)

    logger.info("round_finished", round_id=str(round_id))
    return round_
