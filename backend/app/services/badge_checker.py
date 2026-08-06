"""Badge registry — the single source of truth for every badge rule.

Cada badge é uma **medição** (quanto o usuário já fez) mais um **alvo**. Todo o
resto se deriva daí:

- conquistou?  ``await spec.measure(...) >= spec.target``
- progresso?   ``min(await spec.measure(...), spec.target)``  (ver ``services.badge``)

O award roda como FastAPI BackgroundTask e abre sua própria sessão de banco,
para não usar a sessão da request que já foi commitada.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.rls import apply_rls_user
from app.db.engine import AsyncSessionLocal
from app.db.models.badge import Badge, UserBadge
from app.db.models.book_review import BookReview
from app.db.models.group import Group
from app.db.models.message import GroupMessage
from app.db.models.reading_progress import ReadingProgress
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round
from app.db.models.user import User

logger = structlog.get_logger(__name__)

# Contexto do evento que disparou a checagem (round_id, group_id, ...).
BadgeContext = Mapping[str, str]

# Uma medição responde "quanto o usuário já acumulou" para um badge.
Measure = Callable[[AsyncSession, uuid.UUID, BadgeContext], Awaitable[int]]


@dataclass(frozen=True)
class BadgeSpec:
    """A regra completa de um badge: quanto medir e quanto basta."""

    target: int
    measure: Measure
    # Quando True, o UserBadge guarda o group_id/round_id do evento.
    scoped: bool = False


# Event type → badge slugs to check
_EVENT_BADGES: dict[str, list[str]] = {
    "book_finished": ["first_blood", "bookworm", "speed_reader", "variety"],
    "review_submitted": ["reviewer", "crybaby", "hot_take", "romantic"],
    "message_sent": ["social_butterfly"],
    "streak_updated": ["streak_7", "streak_30", "streak_100"],
    "session_stopped": ["marathon", "night_owl"],
    "group_created": ["founder"],
}


# ── Medições ──────────────────────────────────────────────────────────────────


async def _count_reviews(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    result = await db.execute(select(func.count(BookReview.id)).where(BookReview.user_id == user_id))
    return int(result.scalar_one() or 0)


def _count_reviews_where(flag: InstrumentedAttribute[bool]) -> Measure:
    """Conta reviews do usuário com um booleano marcado (chorou, amou, ...)."""

    async def _measure(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
        result = await db.execute(
            select(func.count(BookReview.id)).where(
                BookReview.user_id == user_id,
                flag.is_(True),
            )
        )
        return int(result.scalar_one() or 0)

    return _measure


async def _count_genres(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    """Gêneros distintos entre os livros que o usuário resenhou."""
    rounds_result = await db.execute(
        select(Round.book_genres).where(
            Round.id.in_(select(BookReview.round_id).where(BookReview.user_id == user_id)),
            Round.book_genres.isnot(None),
        )
    )
    genres: set[str] = set()
    for (genre_list,) in rounds_result.all():
        genres.update(genre_list or [])
    return len(genres)


async def _count_group_messages(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    """Mensagens do usuário no grupo do evento — ou, sem grupo no contexto,
    no grupo em que ele mais falou (é o que a barra de progresso mostra)."""
    group_id_str = ctx.get("group_id")
    if group_id_str:
        result = await db.execute(
            select(func.count(GroupMessage.id)).where(
                GroupMessage.user_id == user_id,
                GroupMessage.group_id == uuid.UUID(group_id_str),
                GroupMessage.is_deleted.is_(False),
            )
        )
        return int(result.scalar_one() or 0)

    top_result = await db.execute(
        select(func.count(GroupMessage.id))
        .where(
            GroupMessage.user_id == user_id,
            GroupMessage.is_deleted.is_(False),
        )
        .group_by(GroupMessage.group_id)
        .order_by(func.count(GroupMessage.id).desc())
        .limit(1)
    )
    row = top_result.one_or_none()
    return int(row[0]) if row else 0


async def _current_streak(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    result = await db.execute(select(User.streak_current).where(User.id == user_id))
    return int(result.scalar_one_or_none() or 0)


async def _longest_session_minutes(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    """A sessão mais longa já registrada — incluindo a que acabou de fechar,
    que pode ainda não estar visível na sessão de banco do background task."""
    result = await db.execute(
        select(func.max(ReadingSession.duration_minutes)).where(ReadingSession.user_id == user_id)
    )
    longest = int(result.scalar_one_or_none() or 0)

    duration_str = ctx.get("duration_minutes")
    if duration_str:
        longest = max(longest, int(duration_str))
    return longest


async def _count_night_sessions(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    """Sessões iniciadas entre meia-noite e 5h **no fuso do usuário**.

    Quem lê às 2h em UTC-3 conta como madrugada; comparar em UTC contaria o
    horário errado (mesma regra de fuso do streak).
    """
    tz_result = await db.execute(select(User.timezone).where(User.id == user_id))
    tz_name = tz_result.scalar_one_or_none() or "UTC"
    try:
        ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ValueError):
        tz_name = "UTC"

    local_hour = func.extract("hour", func.timezone(tz_name, ReadingSession.started_at))
    result = await db.execute(
        select(func.count(ReadingSession.id)).where(
            ReadingSession.user_id == user_id,
            local_hour < 5,
        )
    )
    return int(result.scalar_one() or 0)


async def _count_groups_founded(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    result = await db.execute(
        select(func.count(Group.id)).where(
            Group.created_by == user_id,
            Group.is_active.is_(True),
        )
    )
    return int(result.scalar_one() or 0)


async def _is_first_to_finish(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    round_id = uuid.UUID(ctx["round_id"])

    # Did this user finish (percentage >= 100)?
    my_progress = await db.execute(
        select(ReadingProgress)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
            ReadingProgress.percentage >= 100.0,
        )
        .limit(1)
    )
    if not my_progress.scalar_one_or_none():
        return 0

    # Is this user the FIRST to finish?
    first_finisher = await db.execute(
        select(ReadingProgress.user_id)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.percentage >= 100.0,
        )
        .order_by(ReadingProgress.created_at.asc())
        .limit(1)
    )
    return 1 if first_finisher.scalar_one_or_none() == user_id else 0


async def _finished_in_under_a_week(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    round_id = uuid.UUID(ctx["round_id"])

    round_result = await db.execute(select(Round).where(Round.id == round_id))
    round_ = round_result.scalar_one_or_none()
    if not round_ or not round_.started_at:
        return 0

    finished_progress = await db.execute(
        select(ReadingProgress.created_at)
        .where(
            ReadingProgress.round_id == round_id,
            ReadingProgress.user_id == user_id,
            ReadingProgress.percentage >= 100.0,
        )
        .order_by(ReadingProgress.created_at.asc())
        .limit(1)
    )
    finished_at = finished_progress.scalar_one_or_none()
    if not finished_at:
        return 0

    return 1 if (finished_at - round_.started_at).days < 7 else 0


async def _is_hot_take(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
    if not ctx.get("group_id"):
        return 0
    round_id = uuid.UUID(ctx["round_id"])

    # User's own rating
    my_review_result = await db.execute(
        select(BookReview.star_rating).where(
            BookReview.round_id == round_id,
            BookReview.user_id == user_id,
        )
    )
    my_rating = my_review_result.scalar_one_or_none()
    if my_rating is None or my_rating > 1:
        return 0

    # Group average (excluding this user)
    group_avg_result = await db.execute(
        select(func.avg(BookReview.star_rating)).where(
            BookReview.round_id == round_id,
            BookReview.user_id != user_id,
        )
    )
    group_avg = group_avg_result.scalar_one_or_none()
    if group_avg is None or float(group_avg) < 4.0:
        return 0

    return 1


def _already_earned(slug: str) -> Measure:
    """Medição de fallback: o badge já está na estante do usuário?

    Serve aos badges cuja condição é contextual (depende da rodada do evento) e
    que portanto não têm o que medir fora do evento — é o que a tela de
    progresso consegue mostrar sobre eles.
    """

    async def _measure(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
        result = await db.execute(
            select(func.count(UserBadge.id))
            .join(Badge, Badge.id == UserBadge.badge_id)
            .where(UserBadge.user_id == user_id, Badge.slug == slug)
        )
        return min(int(result.scalar_one() or 0), 1)

    return _measure


def _round_scoped(slug: str, measure: Measure) -> Measure:
    """Medição que só existe dentro de uma rodada; fora dela, cai no já-conquistado."""

    async def _measure(db: AsyncSession, user_id: uuid.UUID, ctx: BadgeContext) -> int:
        if not ctx.get("round_id"):
            return await _already_earned(slug)(db, user_id, ctx)
        return await measure(db, user_id, ctx)

    return _measure


# ── Registry ──────────────────────────────────────────────────────────────────

BADGES: dict[str, BadgeSpec] = {
    "bookworm": BadgeSpec(5, _count_reviews),
    "reviewer": BadgeSpec(10, _count_reviews),
    "crybaby": BadgeSpec(3, _count_reviews_where(BookReview.cried)),
    "romantic": BadgeSpec(5, _count_reviews_where(BookReview.loved_it)),
    "variety": BadgeSpec(5, _count_genres),
    "social_butterfly": BadgeSpec(100, _count_group_messages, scoped=True),
    "streak_7": BadgeSpec(7, _current_streak),
    "streak_30": BadgeSpec(30, _current_streak),
    "streak_100": BadgeSpec(100, _current_streak),
    "marathon": BadgeSpec(120, _longest_session_minutes, scoped=True),
    "night_owl": BadgeSpec(5, _count_night_sessions),
    "founder": BadgeSpec(1, _count_groups_founded, scoped=True),
    "first_blood": BadgeSpec(1, _round_scoped("first_blood", _is_first_to_finish), scoped=True),
    "speed_reader": BadgeSpec(1, _round_scoped("speed_reader", _finished_in_under_a_week), scoped=True),
    "hot_take": BadgeSpec(1, _round_scoped("hot_take", _is_hot_take), scoped=True),
    # Sem evento que o dispare hoje — só o progresso (0 ou 1) é observável.
    "quote_king": BadgeSpec(1, _already_earned("quote_king")),
}


# ── Award ─────────────────────────────────────────────────────────────────────


async def check_and_award_badges(
    user_id: str,
    event_type: str,
    context: dict[str, str],
) -> None:
    """Check and award applicable badges for a user event.

    This function opens its own DB session with proper RLS setup.
    """
    slugs_to_check = _EVENT_BADGES.get(event_type, [])
    if not slugs_to_check:
        return

    try:
        uid = uuid.UUID(user_id)
        async with AsyncSessionLocal() as db:
            # db.begin() issues an explicit BEGIN before the RLS setting is applied.
            # set_config(..., is_local=true) is transaction-scoped — without explicit
            # begin(), the asyncpg driver may run it before BEGIN is issued, leaving
            # the RLS context unset for subsequent queries.
            async with db.begin():
                await apply_rls_user(db, uid)
                # O catálogo de badges é imutável: um SELECT por evento, não por badge.
                badge_ids = await _load_badge_ids(db, slugs_to_check)
                for slug in slugs_to_check:
                    try:
                        # Savepoint per badge: a failure on one doesn't corrupt
                        # the outer transaction, so other badges can still be awarded.
                        async with db.begin_nested():
                            await _check_and_award(db, uid, slug, context, badge_ids)
                    except Exception:
                        logger.exception(
                            "badge_check_failed",
                            user_id=user_id,
                            slug=slug,
                        )
                # auto-commit on exit from db.begin()
    except Exception:
        logger.exception("badge_checker_session_failed", user_id=user_id)


async def _load_badge_ids(db: AsyncSession, slugs: list[str]) -> dict[str, uuid.UUID]:
    """Resolve slug → badge_id numa única query."""
    result = await db.execute(select(Badge.slug, Badge.id).where(Badge.slug.in_(slugs)))
    return {slug: badge_id for slug, badge_id in result.all()}


async def _check_and_award(
    db: AsyncSession,
    user_id: uuid.UUID,
    slug: str,
    context: BadgeContext,
    badge_ids: dict[str, uuid.UUID],
) -> None:
    """Check condition for a single badge and award if met."""
    spec = BADGES.get(slug)
    if spec is None:
        return

    badge_id = badge_ids.get(slug)
    if badge_id is None:
        return

    if await spec.measure(db, user_id, context) < spec.target:
        return

    award_context = context if spec.scoped else {}
    group_id = uuid.UUID(award_context["group_id"]) if award_context.get("group_id") else None
    round_id = uuid.UUID(award_context["round_id"]) if award_context.get("round_id") else None

    # Insert with ON CONFLICT DO NOTHING for idempotency
    await db.execute(
        pg_insert(UserBadge)
        .values(
            user_id=user_id,
            badge_id=badge_id,
            group_id=group_id,
            round_id=round_id,
        )
        .on_conflict_do_nothing()
    )
    logger.info("badge_awarded", user_id=str(user_id), slug=slug)
