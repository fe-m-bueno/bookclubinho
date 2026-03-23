"""Wrapped service — computes and persists the annual wrapped report for a group."""

from __future__ import annotations

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
from app.db.models.hall_of_quote import HallOfQuote, QuoteVote
from app.db.models.reading_progress import ReadingProgress
from app.db.models.reading_session import ReadingSession
from app.db.models.round import Round, RoundStatus
from app.db.models.user import User
from app.db.models.wrapped_report import WrappedReport
from app.services.stats import _bool_sum, _tally_genres

logger = structlog.get_logger(__name__)


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
        raise WrappedError(
            f"Wrapped {year} ainda não foi gerado para este grupo.", status_code=404
        )
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


async def _compute_wrapped_data(
    db: AsyncSession,
    group_id: uuid.UUID,
    year: int,
) -> dict[str, Any]:
    """Run all aggregation queries and return the raw data dict for the JSONB column."""

    # ── Group info ────────────────────────────────────────────────────────────
    group_result = await db.execute(select(Group).where(Group.id == group_id))
    group = group_result.scalar_one_or_none()
    group_name = group.name if group else ""
    group_photo_url = group.photo_url if group else None

    # ── Finished rounds for the year ─────────────────────────────────────────
    rounds_result = await db.execute(
        select(Round).where(
            Round.group_id == group_id,
            Round.status == RoundStatus.FINISHED,
            func.extract("year", Round.finished_at) == year,
        )
    )
    finished_rounds = rounds_result.scalars().all()

    total_books_read = len(finished_rounds)
    total_pages = sum(r.book_page_count or 0 for r in finished_rounds)
    round_ids = [r.id for r in finished_rounds]

    # ── Total reading hours ───────────────────────────────────────────────────
    if round_ids:
        time_result = await db.execute(
            select(func.coalesce(func.sum(ReadingSession.duration_minutes), 0)).where(
                ReadingSession.round_id.in_(round_ids)
            )
        )
        total_minutes = int(time_result.scalar_one())
    else:
        total_minutes = 0
    total_reading_hours = round(total_minutes / 60, 2)

    # ── Genre breakdown with percentages ─────────────────────────────────────
    raw_genres = _tally_genres([r.book_genres for r in finished_rounds])
    total_genre_count = sum(item["count"] for item in raw_genres)
    genre_breakdown = [
        {
            "genre": item["genre"],
            "count": item["count"],
            "percentage": round(
                (item["count"] / total_genre_count * 100) if total_genre_count else 0.0, 2
            ),
        }
        for item in raw_genres
    ]

    # ── Highest rated book ────────────────────────────────────────────────────
    highest_rated_book = None
    if round_ids:
        avg_rating_result = await db.execute(
            select(
                BookReview.round_id,
                func.avg(BookReview.star_rating).label("avg_rating"),
            )
            .where(BookReview.round_id.in_(round_ids))
            .group_by(BookReview.round_id)
            .order_by(func.avg(BookReview.star_rating).desc())
            .limit(1)
        )
        top_rating_row = avg_rating_result.one_or_none()
        if top_rating_row is not None:
            top_round = next(
                (r for r in finished_rounds if r.id == top_rating_row.round_id), None
            )
            if top_round is not None:
                highest_rated_book = {
                    "title": top_round.book_title or "",
                    "cover_url": top_round.book_cover_url,
                    "author": top_round.book_author,
                    "avg_rating": round(float(top_rating_row.avg_rating), 2),
                }

    # ── Most active member (most reading progress snapshots) ─────────────────
    most_active_member = None
    if round_ids:
        active_result = await db.execute(
            select(User)
            .join(ReadingProgress, ReadingProgress.user_id == User.id)
            .where(ReadingProgress.round_id.in_(round_ids))
            .group_by(User.id)
            .order_by(func.count(ReadingProgress.id).desc())
            .limit(1)
        )
        active_user = active_result.scalar_one_or_none()
        if active_user is not None:
            most_active_member = {
                "user_id": str(active_user.id),
                "username": active_user.username or "",
                "display_name": active_user.display_name,
                "avatar_url": active_user.avatar_url,
            }

    # ── Longest streak member ─────────────────────────────────────────────────
    longest_streak_member = None
    streak_result = await db.execute(
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
        .order_by(User.streak_longest.desc())
        .limit(1)
    )
    streak_user = streak_result.scalar_one_or_none()
    if streak_user is not None:
        longest_streak_member = {
            "user_id": str(streak_user.id),
            "username": streak_user.username or "",
            "display_name": streak_user.display_name,
            "avatar_url": streak_user.avatar_url,
        }

    # ── Funniest oneliner (funny_oneliner from BookReview in year rounds) ────────
    funniest_oneliner = None
    if round_ids:
        oneliner_result = await db.execute(
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
        oneliner_row = oneliner_result.one_or_none()
        if oneliner_row is not None:
            review, oneliner_author = oneliner_row
            funniest_oneliner = {
                "text": review.funny_oneliner,
                "author_username": oneliner_author.username or "",
                "author_display_name": oneliner_author.display_name,
                "author_avatar_url": oneliner_author.avatar_url,
                "vote_count": 0,
            }

    # ── Most emotional book (highest cried percentage) ────────────────────────
    most_emotional_book = None
    if round_ids:
        emotional_result = await db.execute(
            select(
                BookReview.round_id,
                func.count(BookReview.id).label("total"),
                _bool_sum(BookReview.cried).label("cried_count"),
            )
            .where(BookReview.round_id.in_(round_ids))
            .group_by(BookReview.round_id)
            .order_by(
                (
                    cast(_bool_sum(BookReview.cried), Float)
                    / func.nullif(func.count(BookReview.id), 0)
                ).desc()
            )
            .limit(1)
        )
        emotional_row = emotional_result.one_or_none()
        if emotional_row is not None and int(emotional_row.total) > 0:
            emo_round = next(
                (r for r in finished_rounds if r.id == emotional_row.round_id), None
            )
            if emo_round is not None:
                cried_pct = round(
                    float(emotional_row.cried_count or 0) / float(emotional_row.total) * 100, 2
                )
                most_emotional_book = {
                    "title": emo_round.book_title or "",
                    "cover_url": emo_round.book_cover_url,
                    "author": emo_round.book_author,
                    "cried_percentage": cried_pct,
                }

    # ── Member avatars ────────────────────────────────────────────────────────
    avatars_result = await db.execute(
        select(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
    )
    group_members = avatars_result.scalars().all()
    member_avatars = [
        {
            "user_id": str(u.id),
            "username": u.username or "",
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
        }
        for u in group_members
    ]

    # ── Member superlatives ───────────────────────────────────────────────────
    member_superlatives = await _compute_superlatives(
        db, round_ids=round_ids, members=group_members
    )

    # ── Emotional stats (year-scoped) ─────────────────────────────────────────
    if round_ids:
        es_result = await db.execute(
            select(
                func.count(BookReview.id).label("total_reviews"),
                _bool_sum(BookReview.cried).label("cried_count"),
                _bool_sum(BookReview.loved_it).label("loved_it_count"),
                _bool_sum(BookReview.felt_aroused).label("felt_aroused_count"),
                _bool_sum(BookReview.found_heavy).label("found_heavy_count"),
                _bool_sum(BookReview.wants_more_from_author).label("wants_more_count"),
            ).where(BookReview.round_id.in_(round_ids))
        )
        es_row = es_result.one()
        emotional_stats = {
            "total_reviews": int(es_row.total_reviews or 0),
            "cried_count": int(es_row.cried_count or 0),
            "loved_it_count": int(es_row.loved_it_count or 0),
            "felt_aroused_count": int(es_row.felt_aroused_count or 0),
            "found_heavy_count": int(es_row.found_heavy_count or 0),
            "wants_more_count": int(es_row.wants_more_count or 0),
        }
    else:
        emotional_stats = {
            "total_reviews": 0,
            "cried_count": 0,
            "loved_it_count": 0,
            "felt_aroused_count": 0,
            "found_heavy_count": 0,
            "wants_more_count": 0,
        }

    return {
        "year": year,
        "group_name": group_name,
        "group_photo_url": group_photo_url,
        "total_books_read": total_books_read,
        "total_pages": total_pages,
        "total_reading_hours": total_reading_hours,
        "genre_breakdown": genre_breakdown,
        "highest_rated_book": highest_rated_book,
        "most_active_member": most_active_member,
        "longest_streak_member": longest_streak_member,
        "funniest_oneliner": funniest_oneliner,
        "most_emotional_book": most_emotional_book,
        "member_superlatives": member_superlatives,
        "emotional_stats": emotional_stats,
        "member_avatars": member_avatars,
    }


async def _compute_superlatives(
    db: AsyncSession,
    round_ids: list[Any],
    members: list[User],
) -> list[dict[str, Any]]:
    """Compute the 5 member superlatives for the wrapped report."""
    superlatives: list[dict[str, Any]] = []

    if not members:
        return superlatives

    member_ids = [m.id for m in members]
    members_by_id = {m.id: m for m in members}

    # ── 1. Leitor Relâmpago — min avg reading time per book ───────────────────
    if round_ids:
        speed_result = await db.execute(
            select(
                ReadingSession.user_id,
                func.sum(ReadingSession.duration_minutes).label("total_minutes"),
                func.count(ReadingSession.round_id.distinct()).label("book_count"),
            )
            .where(
                ReadingSession.round_id.in_(round_ids),
                ReadingSession.user_id.in_(member_ids),
                ReadingSession.duration_minutes.isnot(None),
            )
            .group_by(ReadingSession.user_id)
            .having(func.count(ReadingSession.round_id.distinct()) > 0)
            .order_by(
                (func.sum(ReadingSession.duration_minutes) / func.count(ReadingSession.round_id.distinct())).asc()
            )
            .limit(1)
        )
        speed_row = speed_result.one_or_none()
        if speed_row is not None:
            u = members_by_id.get(speed_row.user_id)
            if u is not None:
                avg_minutes = int(speed_row.total_minutes) // max(int(speed_row.book_count), 1)
                superlatives.append(
                    _make_superlative(
                        user=u,
                        title="Leitor Relâmpago",
                        emoji="⚡",
                        stat_label="Tempo médio por livro",
                        stat_value=f"{avg_minutes} min",
                    )
                )

    # ── 2. Crítico Literário — most reviews submitted ─────────────────────────
    if round_ids:
        reviews_result = await db.execute(
            select(
                BookReview.user_id,
                func.count(BookReview.id).label("review_count"),
            )
            .where(
                BookReview.round_id.in_(round_ids),
                BookReview.user_id.in_(member_ids),
            )
            .group_by(BookReview.user_id)
            .order_by(func.count(BookReview.id).desc())
            .limit(1)
        )
        reviews_row = reviews_result.one_or_none()
        if reviews_row is not None:
            u = members_by_id.get(reviews_row.user_id)
            if u is not None:
                superlatives.append(
                    _make_superlative(
                        user=u,
                        title="Crítico Literário",
                        emoji="📝",
                        stat_label="Reviews enviadas",
                        stat_value=str(int(reviews_row.review_count)),
                    )
                )

    # ── 3. Mestre das Citações — most quotes added ────────────────────────────
    if round_ids:
        quotes_result = await db.execute(
            select(
                HallOfQuote.user_id,
                func.count(HallOfQuote.id).label("quote_count"),
            )
            .where(
                HallOfQuote.round_id.in_(round_ids),
                HallOfQuote.user_id.in_(member_ids),
            )
            .group_by(HallOfQuote.user_id)
            .order_by(func.count(HallOfQuote.id).desc())
            .limit(1)
        )
        quotes_row = quotes_result.one_or_none()
        if quotes_row is not None:
            u = members_by_id.get(quotes_row.user_id)
            if u is not None:
                superlatives.append(
                    _make_superlative(
                        user=u,
                        title="Mestre das Citações",
                        emoji="💬",
                        stat_label="Citações adicionadas",
                        stat_value=str(int(quotes_row.quote_count)),
                    )
                )

    # ── 4. Chorão Oficial — highest cried=True percentage ─────────────────────
    if round_ids:
        cried_result = await db.execute(
            select(
                BookReview.user_id,
                func.count(BookReview.id).label("total"),
                _bool_sum(BookReview.cried).label("cried_count"),
            )
            .where(
                BookReview.round_id.in_(round_ids),
                BookReview.user_id.in_(member_ids),
            )
            .group_by(BookReview.user_id)
            .having(func.count(BookReview.id) > 0)
            .order_by(
                (
                    cast(_bool_sum(BookReview.cried), Float)
                    / func.nullif(func.count(BookReview.id), 0)
                ).desc()
            )
            .limit(1)
        )
        cried_row = cried_result.one_or_none()
        if cried_row is not None:
            u = members_by_id.get(cried_row.user_id)
            if u is not None:
                pct = round(
                    float(cried_row.cried_count or 0) / float(cried_row.total) * 100, 0
                )
                superlatives.append(
                    _make_superlative(
                        user=u,
                        title="Chorão Oficial",
                        emoji="😭",
                        stat_label="Livros que fizeram chorar",
                        stat_value=f"{int(pct)}%",
                    )
                )

    # ── 5. Sequência Imbatível — highest streak_longest ───────────────────────
    streak_winner = max(members, key=lambda u: u.streak_longest, default=None)
    if streak_winner is not None:
        superlatives.append(
            _make_superlative(
                user=streak_winner,
                title="Sequência Imbatível",
                emoji="🔥",
                stat_label="Maior streak",
                stat_value=f"{streak_winner.streak_longest} dias",
            )
        )

    return superlatives


def _make_superlative(
    *,
    user: User,
    title: str,
    emoji: str,
    stat_label: str,
    stat_value: str,
) -> dict[str, Any]:
    return {
        "user_id": str(user.id),
        "username": user.username or "",
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "title": title,
        "emoji": emoji,
        "stat_label": stat_label,
        "stat_value": stat_value,
    }
