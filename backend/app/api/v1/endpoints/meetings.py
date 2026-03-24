"""
Meeting endpoints.

group_meetings_router — montado em /groups/{group_id}/meetings
  POST /   — membro cria encontro
  GET  /   — membro lista encontros (upcoming/past)

meetings_router — montado em /meetings
  GET    /{meeting_id}               — detalhe com RSVPs
  PATCH  /{meeting_id}               — atualizar (owner-or-admin)
  DELETE /{meeting_id}               — cancelar (owner-or-admin)
  POST   /{meeting_id}/rsvp          — atualizar RSVP
  POST   /{meeting_id}/calendar      — download .ics
  GET    /{meeting_id}/google-calendar-url — URL Google Calendar
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.db.models.meeting import Meeting, MeetingRsvp  # noqa: TC001
from app.schemas.meeting import (
    MeetingCreateRequest,
    MeetingListItem,
    MeetingListResponse,
    MeetingResponse,
    MeetingUpdateRequest,
    RsvpRequest,
    RsvpSummary,
    UpcomingMeetingItem,
    UpcomingMeetingsResponse,
)
from app.security.rate_limit import limiter
from app.services.calendar_service import generate_google_calendar_url, generate_ics
from app.services.meeting import (
    MeetingError,
    create_meeting,
    delete_meeting,
    get_meeting,
    has_upcoming_soon,
    list_meetings,
    list_upcoming_meetings,
    update_meeting,
    update_rsvp,
)

group_meetings_router = APIRouter(tags=["meetings"])
meetings_router = APIRouter(tags=["meetings"])


# ── Helpers ───────────────────────────────────────────────────────────────────


def _rsvp_counts(rsvps: list[MeetingRsvp]) -> dict[str, int]:
    """Compute RSVP status counts."""
    counts: dict[str, int] = {"going": 0, "maybe": 0, "not_going": 0, "pending": 0}
    for r in rsvps:
        counts[r.status] += 1
    return counts


def _rsvp_to_summary(r: MeetingRsvp) -> RsvpSummary:
    return RsvpSummary(
        user_id=str(r.user_id),
        username=r.user.username,
        display_name=r.user.display_name,
        avatar_url=r.user.avatar_url,
        status=r.status,
        responded_at=r.responded_at,
    )


def _meeting_base(meeting: Meeting) -> dict:
    """Shared fields for MeetingResponse and MeetingListItem."""
    return {
        "id": str(meeting.id),
        "group_id": str(meeting.group_id),
        "round_id": str(meeting.round_id) if meeting.round_id else None,
        "title": meeting.title,
        "description": meeting.description,
        "location": meeting.location,
        "meeting_type": meeting.meeting_type,
        "virtual_link": meeting.virtual_link,
        "scheduled_at": meeting.scheduled_at,
        "duration_minutes": meeting.duration_minutes,
        "created_by": str(meeting.created_by),
        "creator_username": meeting.creator.username,
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
    }


def _meeting_to_response(meeting: Meeting) -> MeetingResponse:
    return MeetingResponse(
        **_meeting_base(meeting),
        rsvps=[_rsvp_to_summary(r) for r in meeting.rsvps],
        rsvp_counts=_rsvp_counts(meeting.rsvps),
    )


def _meeting_to_list_item(meeting: Meeting, current_user_id: uuid.UUID) -> MeetingListItem:
    my_rsvp = next(
        (r.status for r in meeting.rsvps if r.user_id == current_user_id),
        None,
    )
    return MeetingListItem(
        **_meeting_base(meeting),
        rsvp_counts=_rsvp_counts(meeting.rsvps),
        my_rsvp_status=my_rsvp,
    )


# ── /groups/{group_id}/meetings ───────────────────────────────────────────────


@group_meetings_router.post(
    "",
    response_model=MeetingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar encontro",
)
@limiter.limit("10/minute")
async def create_meeting_endpoint(
    request: Request,
    group_id: uuid.UUID,
    body: MeetingCreateRequest,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> MeetingResponse:
    """Cria um novo encontro para o grupo."""
    try:
        meeting = await create_meeting(
            db,
            group_id=group_id,
            user_id=current_user.id,
            data=body,
            creator_name=current_user.display_name or current_user.username,
        )
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    reloaded = await get_meeting(db, meeting.id, current_user.id)
    return _meeting_to_response(reloaded)


@group_meetings_router.get(
    "",
    response_model=MeetingListResponse,
    summary="Listar encontros do grupo",
)
@limiter.limit("30/minute")
async def list_meetings_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
    filter: str = Query(default="upcoming", regex="^(upcoming|past)$"),  # noqa: A002
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
) -> MeetingListResponse:
    """Lista encontros do grupo com paginação cursor-based."""
    try:
        meetings, next_cursor = await list_meetings(
            db,
            group_id=group_id,
            user_id=current_user.id,
            filter_type=filter,
            cursor=cursor,
            limit=limit,
        )
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MeetingListResponse(
        meetings=[_meeting_to_list_item(m, current_user.id) for m in meetings],
        next_cursor=next_cursor,
    )


@group_meetings_router.get(
    "/has-upcoming",
    summary="Verificar se há encontro próximo (48h)",
)
@limiter.limit("30/minute")
async def has_upcoming_endpoint(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
) -> dict[str, bool]:
    """Retorna se há encontro nas próximas 48h (leve, para badge)."""
    result = await has_upcoming_soon(db, group_id=group_id)
    return {"has_upcoming_soon": result}


# ── /meetings ─────────────────────────────────────────────────────────────────


@meetings_router.get(
    "/upcoming",
    response_model=UpcomingMeetingsResponse,
    summary="Próximos encontros cross-grupo",
)
@limiter.limit("30/minute")
async def upcoming_meetings_endpoint(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(default=3, ge=1, le=50),
) -> UpcomingMeetingsResponse:
    """Retorna próximos encontros de todos os grupos do usuário."""
    meetings = await list_upcoming_meetings(db, user_id=current_user.id, limit=limit)

    items = []
    for m in meetings:
        my_rsvp = next(
            (r.status for r in m.rsvps if r.user_id == current_user.id),
            None,
        )
        items.append(
            UpcomingMeetingItem(
                id=str(m.id),
                title=m.title,
                scheduled_at=m.scheduled_at,
                duration_minutes=m.duration_minutes,
                meeting_type=m.meeting_type,
                group_id=str(m.group_id),
                group_name=m.group.name,
                group_photo_url=m.group.photo_url,
                my_rsvp_status=my_rsvp,
            )
        )

    return UpcomingMeetingsResponse(meetings=items)


@meetings_router.get(
    "/{meeting_id}",
    response_model=MeetingResponse,
    summary="Detalhe do encontro",
)
@limiter.limit("30/minute")
async def get_meeting_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> MeetingResponse:
    """Retorna detalhes do encontro com lista completa de RSVPs."""
    try:
        meeting = await get_meeting(db, meeting_id=meeting_id, user_id=current_user.id)
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return _meeting_to_response(meeting)


@meetings_router.patch(
    "/{meeting_id}",
    response_model=MeetingResponse,
    summary="Atualizar encontro",
)
@limiter.limit("10/minute")
async def update_meeting_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    body: MeetingUpdateRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> MeetingResponse:
    """Atualiza um encontro. Apenas criador ou admin."""
    try:
        await update_meeting(db, meeting_id=meeting_id, user_id=current_user.id, data=body)
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    reloaded = await get_meeting(db, meeting_id, current_user.id)
    return _meeting_to_response(reloaded)


@meetings_router.delete(
    "/{meeting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancelar encontro",
)
@limiter.limit("10/minute")
async def delete_meeting_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    """Cancela (hard delete) um encontro. Apenas criador ou admin."""
    try:
        await delete_meeting(
            db,
            meeting_id=meeting_id,
            user_id=current_user.id,
            user_name=current_user.display_name or current_user.username,
        )
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@meetings_router.post(
    "/{meeting_id}/rsvp",
    response_model=MeetingResponse,
    summary="Atualizar RSVP",
)
@limiter.limit("20/minute")
async def update_rsvp_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    body: RsvpRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> MeetingResponse:
    """Atualiza o RSVP do usuário para o encontro."""
    try:
        await update_rsvp(
            db,
            meeting_id=meeting_id,
            user_id=current_user.id,
            status=body.status,
        )
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    reloaded = await get_meeting(db, meeting_id, current_user.id)
    return _meeting_to_response(reloaded)


@meetings_router.post(
    "/{meeting_id}/calendar",
    summary="Download .ics",
)
@limiter.limit("20/minute")
async def download_ics_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> Response:
    """Gera e retorna arquivo .ics para o encontro."""
    try:
        meeting = await get_meeting(db, meeting_id=meeting_id, user_id=current_user.id)
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    ics_content = generate_ics(meeting)
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="meeting-{meeting_id}.ics"',
        },
    )


@meetings_router.get(
    "/{meeting_id}/google-calendar-url",
    summary="URL Google Calendar",
)
@limiter.limit("20/minute")
async def google_calendar_url_endpoint(
    request: Request,
    meeting_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> dict[str, str]:
    """Retorna a URL pré-preenchida do Google Calendar."""
    try:
        meeting = await get_meeting(db, meeting_id=meeting_id, user_id=current_user.id)
    except MeetingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    url = generate_google_calendar_url(meeting)
    return {"url": url}
