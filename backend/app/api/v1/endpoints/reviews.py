"""
Book review endpoints.

reviews_router — montado em /rounds
  POST   /{round_id}/review        — enviar review
  GET    /{round_id}/reviews        — listar reviews (requer review própria)
  GET    /{round_id}/reviews/me     — minha review
  PATCH  /{round_id}/reviews/me     — editar (até 48h)
  GET    /{round_id}/reviews/stats  — estatísticas agregadas
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status

from app.core.deps import CurrentUser, DBSession  # noqa: TC001
from app.schemas.review import (
    ReviewCreateRequest,
    ReviewResponse,
    ReviewStatsResponse,
    ReviewUpdateRequest,
    ReviewUserSummary,
)
from app.security.rate_limit import limiter
from app.services.badge_checker import check_and_award_badges
from app.services.review import (
    ReviewError,
    get_all_reviews,
    get_my_review,
    get_review_stats,
    submit_review,
    update_review,
)

reviews_router = APIRouter(tags=["reviews"])


def _review_to_response(review) -> ReviewResponse:  # noqa: ANN001
    return ReviewResponse(
        id=str(review.id),
        round_id=str(review.round_id),
        user_id=str(review.user_id),
        star_rating=review.star_rating,
        cried=review.cried,
        loved_it=review.loved_it,
        felt_aroused=review.felt_aroused,
        found_heavy=review.found_heavy,
        wants_more_from_author=review.wants_more_from_author,
        sincere_review=review.sincere_review,
        funny_oneliner=review.funny_oneliner,
        extra_thoughts=review.extra_thoughts,
        completed_at=review.completed_at,
        created_at=review.created_at,
        user=ReviewUserSummary(
            user_id=str(review.user.id),
            username=review.user.username,
            display_name=review.user.display_name,
            avatar_url=review.user.avatar_url,
        ),
    )


@reviews_router.post(
    "/{round_id}/review",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar review",
)
@limiter.limit("10/minute")
async def submit_review_endpoint(
    request: Request,
    round_id: uuid.UUID,
    body: ReviewCreateRequest,
    current_user: CurrentUser,
    db: DBSession,
    background_tasks: BackgroundTasks,
) -> ReviewResponse:
    """Envia review do livro. Rodada deve estar em leitura ou reviews."""
    try:
        review = await submit_review(
            db, round_id=round_id, user_id=current_user.id, data=body
        )
    except ReviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    background_tasks.add_task(
        check_and_award_badges,
        str(current_user.id),
        "review_submitted",
        {"group_id": str(review.group_id), "round_id": str(round_id)},
    )

    return _review_to_response(review)


@reviews_router.get(
    "/{round_id}/reviews",
    response_model=list[ReviewResponse],
    summary="Listar reviews da rodada",
)
@limiter.limit("30/minute")
async def list_reviews_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> list[ReviewResponse]:
    """Lista todas as reviews. Requer que o usuário tenha enviado sua review."""
    try:
        reviews = await get_all_reviews(db, round_id=round_id, user_id=current_user.id)
    except ReviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return [_review_to_response(r) for r in reviews]


@reviews_router.get(
    "/{round_id}/reviews/me",
    response_model=ReviewResponse,
    summary="Minha review",
)
@limiter.limit("30/minute")
async def my_review_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> ReviewResponse:
    """Retorna a review do usuário autenticado."""
    try:
        review = await get_my_review(db, round_id=round_id, user_id=current_user.id)
    except ReviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Você ainda não enviou uma review para esta rodada.",
        )

    return _review_to_response(review)


@reviews_router.patch(
    "/{round_id}/reviews/me",
    response_model=ReviewResponse,
    summary="Editar minha review",
)
@limiter.limit("10/minute")
async def update_review_endpoint(
    request: Request,
    round_id: uuid.UUID,
    body: ReviewUpdateRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> ReviewResponse:
    """Edita a review do usuário. Permitido até 48h após envio."""
    try:
        review = await update_review(
            db, round_id=round_id, user_id=current_user.id, data=body
        )
    except ReviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _review_to_response(review)


@reviews_router.get(
    "/{round_id}/reviews/stats",
    response_model=ReviewStatsResponse,
    summary="Estatísticas das reviews",
)
@limiter.limit("30/minute")
async def review_stats_endpoint(
    request: Request,
    round_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> ReviewStatsResponse:
    """Estatísticas agregadas das reviews. Requer review própria enviada."""
    try:
        stats = await get_review_stats(db, round_id=round_id, user_id=current_user.id)
    except ReviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return ReviewStatsResponse(**stats)
