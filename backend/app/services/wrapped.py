"""Wrapped service — computes and persists the annual wrapped report for a group."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import Float, cast, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

if TYPE_CHECKING:
    import uuid

    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.book_review import BookReview
from app.db.models.group import Group, GroupMember
from app.db.models.hall_of_quote import HallOfQuote
from app.db.models.reading_progress import ReadingProgress
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round, RoundStatus
from app.db.models.user import User
from app.db.models.wrapped_report import WrappedReport
from app.services.stats import _bool_sum, _tally_genres

logger = structlog.get_logger(__name__)

EMPTY_EMOTIONAL_STATS: dict[str, int] = {
    "total_reviews": 0,
    "cried_count": 0,
    "loved_it_count": 0,
    "felt_aroused_count": 0,
    "found_heavy_count": 0,
    "wants_more_count": 0,
}


class WrappedError(ServiceError):
    """Raised when wrapped validation or lookup fails."""


# ── Public API ────────────────────────────────────────────────────────────────


async def get_wrapped(
    db: AsyncSession,
    group_id: uuid.UUID,
    year: int,
) -> dict[str, Any]:
    """Return a previously generated wrapped report dict, or raise WrappedError 404."""
    result = await db.execute(
        select(WrappedReport).where(
            WrappedReport.group_id == group_id,
            WrappedReport.year == year,
        )
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise WrappedError(f"Wrapped {year} ainda não foi gerado para este grupo.", status_code=404)
    return _report_to_dict(report)


async def generate_wrapped(
    db: AsyncSession,
    group_id: uuid.UUID,
    year: int,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """Compute and upsert the wrapped report. Returns the resulting dict."""
    data = await _compute_wrapped_data(db, group_id=group_id, year=year)

    stmt = (
        pg_insert(WrappedReport)
        .values(
            group_id=group_id,
            year=year,
            data=data,
            generated_by=user_id,
        )
        .on_conflict_do_update(
            index_elements=["group_id", "year"],
            set_={
                "data": data,
                "generated_by": user_id,
                "generated_at": func.now(),
                "updated_at": func.now(),
            },
        )
        .returning(WrappedReport)
    )
    result = await db.execute(stmt)
    await db.commit()
    report = result.scalar_one()

    logger.info(
        "wrapped_generated",
        group_id=str(group_id),
        year=year,
        generated_by=str(user_id),
    )
    return _report_to_dict(report)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _report_to_dict(report: WrappedReport) -> dict[str, Any]:
    """Serialize a WrappedReport ORM object to a plain dict for the response schema."""
    return {
        "group_id": str(report.group_id),
        "year": report.year,
        "data": report.data,
        "generated_at": report.generated_at,
        "generated_by": str(report.generated_by),
    }


# ── Wrapped data assembly ─────────────────────────────────────────────────────
#
# Every query below runs sequentially on the same AsyncSession. Do NOT wrap them in
# asyncio.gather: an AsyncSession does not support concurrent operations and would
# raise "InterfaceError: another operation is in progress". If wrapped latency ever
# matters, merge queries (a single GROUP BY round_id covers several aggregations),
# don't run them in parallel — the report is generated once a year per group.


async def _compute_wrapped_data(
    db: AsyncSession,
    group_id: uuid.UUID,
    year: int,
) -> dict[str, Any]:
    """Run all aggregation queries and return the raw data dict for the JSONB column."""
    group = await _fetch_group(db, group_id=group_id)
    finished_rounds = await _fetch_finished_rounds(db, group_id=group_id, year=year)

    if not finished_rounds:
        return await _empty_wrapped(db, group_id=group_id, year=year, group=group)

    round_ids = [r.id for r in finished_rounds]

    total_reading_hours = await _total_reading_hours(db, round_ids=round_ids)
    highest_rated_book = await _highest_rated_book(db, rounds=finished_rounds)
    most_active_member = await _most_active_member(db, round_ids=round_ids)
    longest_streak_member = await _longest_streak_member(db, group_id=group_id)
    funniest_oneliner = await _funniest_oneliner(db, round_ids=round_ids)
    most_emotional_book = await _most_emotional_book(db, rounds=finished_rounds)
    group_members = await _fetch_group_members(db, group_id=group_id)
    member_superlatives = await _compute_superlatives(db, round_ids=round_ids, members=group_members)
    emotional_stats = await _emotional_stats(db, round_ids=round_ids)

    return {
        "year": year,
        "group_name": group.name if group else "",
        "group_photo_url": group.photo_url if group else None,
        "total_books_read": len(finished_rounds),
        "total_pages": sum(r.book_page_count or 0 for r in finished_rounds),
        "total_reading_hours": total_reading_hours,
        "genre_breakdown": _genre_breakdown(finished_rounds),
        "highest_rated_book": highest_rated_book,
        "most_active_member": most_active_member,
        "longest_streak_member": longest_streak_member,
        "funniest_oneliner": funniest_oneliner,
        "most_emotional_book": most_emotional_book,
        "member_superlatives": member_superlatives,
        "emotional_stats": emotional_stats,
        "member_avatars": [_user_ref(u) for u in group_members],
    }


async def _empty_wrapped(
    db: AsyncSession,
    group_id: uuid.UUID,
    year: int,
    group: Group | None,
) -> dict[str, Any]:
    """Payload for a group with no finished round in the year.

    Not entirely empty: the streak leader, the member avatars and the "Sequência
    Imbatível" superlative come from group membership, which exists regardless of
    any round having finished.
    """
    longest_streak_member = await _longest_streak_member(db, group_id=group_id)
    group_members = await _fetch_group_members(db, group_id=group_id)

    return {
        "year": year,
        "group_name": group.name if group else "",
        "group_photo_url": group.photo_url if group else None,
        "total_books_read": 0,
        "total_pages": 0,
        "total_reading_hours": 0.0,
        "genre_breakdown": [],
        "highest_rated_book": None,
        "most_active_member": None,
        "longest_streak_member": longest_streak_member,
        "funniest_oneliner": None,
        "most_emotional_book": None,
        "member_superlatives": _streak_superlative(group_members),
        "emotional_stats": dict(EMPTY_EMOTIONAL_STATS),
        "member_avatars": [_user_ref(u) for u in group_members],
    }


# ── Sections ──────────────────────────────────────────────────────────────────


async def _fetch_group(db: AsyncSession, group_id: uuid.UUID) -> Group | None:
    result = await db.execute(select(Group).where(Group.id == group_id))
    return result.scalar_one_or_none()


async def _fetch_finished_rounds(db: AsyncSession, group_id: uuid.UUID, year: int) -> Sequence[Round]:
    result = await db.execute(
        select(Round).where(
            Round.group_id == group_id,
            Round.status == RoundStatus.FINISHED,
            func.extract("year", Round.finished_at) == year,
        )
    )
    return result.scalars().all()


async def _fetch_group_members(db: AsyncSession, group_id: uuid.UUID) -> Sequence[User]:
    result = await db.execute(
        select(User).join(GroupMember, GroupMember.user_id == User.id).where(GroupMember.group_id == group_id)
    )
    return result.scalars().all()


async def _total_reading_hours(db: AsyncSession, round_ids: list[Any]) -> float:
    """Sum of every reading session minute in the year's rounds, in hours."""
    result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
            ReadingSession.round_id.in_(round_ids)
        )
    )
    return round(int(result.scalar_one()) / 60, 2)


def _genre_breakdown(rounds: Sequence[Round]) -> list[dict[str, Any]]:
    """Genre tally of the year's books, with each genre's share of the total."""
    raw_genres = _tally_genres([r.book_genres for r in rounds])
    total = sum(item["count"] for item in raw_genres)
    return [
        {
            "genre": item["genre"],
            "count": item["count"],
            "percentage": round((item["count"] / total * 100) if total else 0.0, 2),
        }
        for item in raw_genres
    ]


async def _highest_rated_book(db: AsyncSession, rounds: Sequence[Round]) -> dict[str, Any] | None:
    """The year's round with the highest average star rating."""
    round_ids = [r.id for r in rounds]
    result = await db.execute(
        select(
            BookReview.round_id,
            func.avg(BookReview.star_rating).label("avg_rating"),
        )
        .where(BookReview.round_id.in_(round_ids))
        .group_by(BookReview.round_id)
        .order_by(func.avg(BookReview.star_rating).desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        return None
    top_round = next((r for r in rounds if r.id == row.round_id), None)
    if top_round is None:
        return None
    return {
        "title": top_round.book_title or "",
        "cover_url": top_round.book_cover_url,
        "author": top_round.book_author,
        "avg_rating": round(float(row.avg_rating), 2),
    }


async def _most_active_member(db: AsyncSession, round_ids: list[Any]) -> dict[str, Any] | None:
    """The member with the most reading progress snapshots in the year."""
    result = await db.execute(
        select(User)
        .join(ReadingProgress, ReadingProgress.user_id == User.id)
        .where(ReadingProgress.round_id.in_(round_ids))
        .group_by(User.id)
        .order_by(func.count(ReadingProgress.id).desc())
        .limit(1)
    )
    user = result.scalar_one_or_none()
    return _user_ref(user) if user is not None else None


async def _longest_streak_member(db: AsyncSession, group_id: uuid.UUID) -> dict[str, Any] | None:
    """The member with the all-time longest streak — not year-scoped."""
    result = await db.execute(
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
        .order_by(User.streak_longest.desc())
        .limit(1)
    )
    user = result.scalar_one_or_none()
    return _user_ref(user) if user is not None else None


async def _funniest_oneliner(db: AsyncSession, round_ids: list[Any]) -> dict[str, Any] | None:
    """The most recent non-empty funny_oneliner among the year's reviews."""
    result = await db.execute(
        select(BookReview, User)
        .join(User, User.id == BookReview.user_id)
        .where(
            BookReview.round_id.in_(round_ids),
            BookReview.funny_oneliner.isnot(None),
            BookReview.funny_oneliner != "",
        )
        .order_by(BookReview.completed_at.desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        return None
    review, author = row
    return {
        "text": review.funny_oneliner,
        "author_username": author.username or "",
        "author_display_name": author.display_name,
        "author_avatar_url": author.avatar_url,
        "vote_count": 0,
    }


async def _most_emotional_book(db: AsyncSession, rounds: Sequence[Round]) -> dict[str, Any] | None:
    """The year's round whose reviews had the highest share of cried=True."""
    round_ids = [r.id for r in rounds]
    result = await db.execute(
        select(
            BookReview.round_id,
            func.count(BookReview.id).label("total"),
            _bool_sum(BookReview.cried).label("cried_count"),
        )
        .where(BookReview.round_id.in_(round_ids))
        .group_by(BookReview.round_id)
        .order_by((cast(_bool_sum(BookReview.cried), Float) / func.nullif(func.count(BookReview.id), 0)).desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None or int(row.total) <= 0:
        return None
    emo_round = next((r for r in rounds if r.id == row.round_id), None)
    if emo_round is None:
        return None
    return {
        "title": emo_round.book_title or "",
        "cover_url": emo_round.book_cover_url,
        "author": emo_round.book_author,
        "cried_percentage": round(float(row.cried_count or 0) / float(row.total) * 100, 2),
    }


async def _emotional_stats(db: AsyncSession, round_ids: list[Any]) -> dict[str, int]:
    """Counts of each review emotion flag across the year's reviews."""
    result = await db.execute(
        select(
            func.count(BookReview.id).label("total_reviews"),
            _bool_sum(BookReview.cried).label("cried_count"),
            _bool_sum(BookReview.loved_it).label("loved_it_count"),
            _bool_sum(BookReview.felt_aroused).label("felt_aroused_count"),
            _bool_sum(BookReview.found_heavy).label("found_heavy_count"),
            _bool_sum(BookReview.wants_more_from_author).label("wants_more_count"),
        ).where(BookReview.round_id.in_(round_ids))
    )
    row = result.one()
    return {
        "total_reviews": int(row.total_reviews or 0),
        "cried_count": int(row.cried_count or 0),
        "loved_it_count": int(row.loved_it_count or 0),
        "felt_aroused_count": int(row.felt_aroused_count or 0),
        "found_heavy_count": int(row.found_heavy_count or 0),
        "wants_more_count": int(row.wants_more_count or 0),
    }


# ── Superlatives ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _SuperlativeSpec:
    """One query-backed superlative: same shape, different table and aggregation."""

    title: str
    emoji: str
    stat_label: str
    user_column: Any
    round_column: Any
    metric: Any
    """Aggregate expression the ranking sorts by."""
    columns: tuple[Any, ...]
    """Extra labeled columns the winning row exposes to format_stat."""
    format_stat: Callable[[Any], str]
    descending: bool = True
    extra_filters: tuple[Any, ...] = ()
    having: Any | None = None


def _avg_minutes_per_book(row: Any) -> str:
    return f"{int(row.total_minutes) // max(int(row.book_count), 1)} min"


def _cried_percentage(row: Any) -> str:
    return f"{int(round(float(row.cried_count or 0) / float(row.total) * 100, 0))}%"


_SPEED_METRIC = func.sum(ReadingSession.duration_minutes) / func.count(ReadingSession.round_id.distinct())
_CRIED_RATIO = cast(_bool_sum(BookReview.cried), Float) / func.nullif(func.count(BookReview.id), 0)

SUPERLATIVE_SPECS: tuple[_SuperlativeSpec, ...] = (
    _SuperlativeSpec(
        title="Leitor Relâmpago",
        emoji="⚡",
        stat_label="Tempo médio por livro",
        user_column=ReadingSession.user_id,
        round_column=ReadingSession.round_id,
        metric=_SPEED_METRIC,
        descending=False,
        columns=(
            func.sum(ReadingSession.duration_minutes).label("total_minutes"),
            func.count(ReadingSession.round_id.distinct()).label("book_count"),
        ),
        extra_filters=(ReadingSession.duration_minutes.isnot(None),),
        having=func.count(ReadingSession.round_id.distinct()) > 0,
        format_stat=_avg_minutes_per_book,
    ),
    _SuperlativeSpec(
        title="Crítico Literário",
        emoji="📝",
        stat_label="Reviews enviadas",
        user_column=BookReview.user_id,
        round_column=BookReview.round_id,
        metric=func.count(BookReview.id),
        columns=(func.count(BookReview.id).label("review_count"),),
        format_stat=lambda row: str(int(row.review_count)),
    ),
    _SuperlativeSpec(
        title="Mestre das Citações",
        emoji="💬",
        stat_label="Citações adicionadas",
        user_column=HallOfQuote.user_id,
        round_column=HallOfQuote.round_id,
        metric=func.count(HallOfQuote.id),
        columns=(func.count(HallOfQuote.id).label("quote_count"),),
        format_stat=lambda row: str(int(row.quote_count)),
    ),
    _SuperlativeSpec(
        title="Chorão Oficial",
        emoji="😭",
        stat_label="Livros que fizeram chorar",
        user_column=BookReview.user_id,
        round_column=BookReview.round_id,
        metric=_CRIED_RATIO,
        columns=(
            func.count(BookReview.id).label("total"),
            _bool_sum(BookReview.cried).label("cried_count"),
        ),
        having=func.count(BookReview.id) > 0,
        format_stat=_cried_percentage,
    ),
)


async def _compute_superlatives(
    db: AsyncSession,
    round_ids: list[Any],
    members: Sequence[User],
) -> list[dict[str, Any]]:
    """Compute the member superlatives: four query-backed ones plus the streak leader."""
    if not members:
        return []

    members_by_id = {m.id: m for m in members}
    member_ids = list(members_by_id)

    superlatives: list[dict[str, Any]] = []
    for spec in SUPERLATIVE_SPECS:
        winner = await _top_member(db, spec=spec, round_ids=round_ids, member_ids=member_ids)
        if winner is None:
            continue
        row, user_id = winner
        user = members_by_id.get(user_id)
        if user is None:
            continue
        superlatives.append(
            _make_superlative(
                user=user,
                title=spec.title,
                emoji=spec.emoji,
                stat_label=spec.stat_label,
                stat_value=spec.format_stat(row),
            )
        )

    superlatives.extend(_streak_superlative(members))
    return superlatives


async def _top_member(
    db: AsyncSession,
    spec: _SuperlativeSpec,
    round_ids: list[Any],
    member_ids: list[Any],
) -> tuple[Any, Any] | None:
    """Run a spec's ranking query and return (row, user_id) for the winner, if any."""
    stmt = (
        select(spec.user_column, *spec.columns)
        .where(
            spec.round_column.in_(round_ids),
            spec.user_column.in_(member_ids),
            *spec.extra_filters,
        )
        .group_by(spec.user_column)
        .order_by(spec.metric.desc() if spec.descending else spec.metric.asc())
        .limit(1)
    )
    if spec.having is not None:
        stmt = stmt.having(spec.having)

    row = (await db.execute(stmt)).one_or_none()
    return None if row is None else (row, row.user_id)


def _streak_superlative(members: Sequence[User]) -> list[dict[str, Any]]:
    """Sequência Imbatível — the only superlative with no query behind it."""
    winner = max(members, key=lambda u: u.streak_longest, default=None)
    if winner is None:
        return []
    return [
        _make_superlative(
            user=winner,
            title="Sequência Imbatível",
            emoji="🔥",
            stat_label="Maior streak",
            stat_value=f"{winner.streak_longest} dias",
        )
    ]


def _user_ref(user: User) -> dict[str, Any]:
    """The user shape every wrapped section embeds."""
    return {
        "user_id": str(user.id),
        "username": user.username or "",
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
    }


def _make_superlative(
    *,
    user: User,
    title: str,
    emoji: str,
    stat_label: str,
    stat_value: str,
) -> dict[str, Any]:
    return {
        **_user_ref(user),
        "title": title,
        "emoji": emoji,
        "stat_label": stat_label,
        "stat_value": stat_value,
    }
