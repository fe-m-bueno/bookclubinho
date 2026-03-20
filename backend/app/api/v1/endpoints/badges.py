"""
Badge endpoints.

badges_user_router — montado em /users
  GET /me/badges               — meus badges agrupados por categoria

badges_group_router — montado em /groups/{group_id}/badges
  GET /                        — badges do grupo agrupados por membro

badges_catalog_router — montado em /badges
  GET /                        — catálogo completo de badges
  GET /{slug}/progress         — progresso do usuário em um badge
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Request

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.schemas.badge import (
    BadgeCatalogResponse,
    BadgeProgressResponse,
    BadgeResponse,
    GroupBadgesResponse,
    MemberBadgesEntry,
    MyBadgesResponse,
)
from app.security.rate_limit import limiter
from app.services.badge import (
    BadgeError,
    get_badge_catalog,
    get_badge_progress,
    get_group_badges,
    get_my_badges,
)

badges_user_router = APIRouter(tags=["badges"])
badges_group_router = APIRouter(tags=["badges"])
badges_catalog_router = APIRouter(tags=["badges"])


@badges_user_router.get(
    "/me/badges",
    response_model=MyBadgesResponse,
    summary="Meus badges",
)
@limiter.limit("30/minute")
async def my_badges_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
) -> MyBadgesResponse:
    """Retorna os badges conquistados pelo usuário, agrupados por categoria."""
    grouped = await get_my_badges(db, user_id=current_user.id)

    badges_response: dict[str, list[BadgeResponse]] = {}
    for category, badge_list in grouped.items():
        badges_response[category] = [BadgeResponse(**b) for b in badge_list]

    return MyBadgesResponse(badges=badges_response)


@badges_group_router.get(
    "",
    response_model=GroupBadgesResponse,
    summary="Badges do grupo",
)
@limiter.limit("15/minute")
async def group_badges_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> GroupBadgesResponse:
    """Retorna os badges conquistados pelos membros do grupo."""
    members_data = await get_group_badges(db, group_id=group_id)

    members = [
        MemberBadgesEntry(
            user_id=m["user_id"],
            username=m["username"],
            display_name=m["display_name"],
            avatar_url=m["avatar_url"],
            badges=[BadgeResponse(**b) for b in m["badges"]],
        )
        for m in members_data
    ]

    return GroupBadgesResponse(members=members)


@badges_catalog_router.get(
    "",
    response_model=BadgeCatalogResponse,
    summary="Catálogo de badges",
)
@limiter.limit("30/minute")
async def badge_catalog_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
) -> BadgeCatalogResponse:
    """Retorna o catálogo completo de todos os badges disponíveis."""
    catalog = await get_badge_catalog(db)
    return BadgeCatalogResponse(badges=[BadgeResponse(**b) for b in catalog])


@badges_catalog_router.get(
    "/{slug}/progress",
    response_model=BadgeProgressResponse,
    summary="Progresso em um badge",
)
@limiter.limit("30/minute")
async def badge_progress_endpoint(
    request: Request,
    slug: str,
    current_user: CurrentUser,
    db: DBSession,
) -> BadgeProgressResponse:
    """Retorna o progresso do usuário em direção a um badge específico."""
    try:
        progress = await get_badge_progress(db, user_id=current_user.id, slug=slug)
    except BadgeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return BadgeProgressResponse(**progress)
