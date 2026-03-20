"""
Chat endpoints.

group_messages_router — montado em /groups/{group_id}/messages
  GET  /   — membro lista mensagens (paginação cursor-based)
  POST /   — membro envia mensagem

messages_router — montado em /messages
  PATCH  /{message_id}                    — edita mensagem (janela 15min)
  DELETE /{message_id}                    — soft-delete de mensagem
  POST   /{message_id}/reactions          — toggle reaction
  DELETE /{message_id}/reactions/{emoji}  — remove reaction explicitamente
  GET    /{message_id}/reactions          — lista reactions com detalhes
"""

from __future__ import annotations

import uuid  # noqa: TC003

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DBSession, GroupMemberDep  # noqa: TC001
from app.db.models.message import GroupMessage, MessageReaction
from app.schemas.message import (
    ChatMessageResponse,
    MessageAuthor,
    MessageCreateRequest,
    MessageEditRequest,
    MessageListResponse,
    ReactionDetail,
    ReactionListResponse,
    ReactionRequest,
    ReactionSummary,
)
from app.security.rate_limit import limiter
from app.services.badge_checker import check_and_award_badges
from app.services.chat import (
    ChatError,
    create_message,
    delete_message,
    edit_message,
    emit_typing_event,
    list_messages,
    list_reactions,
    remove_reaction,
    toggle_reaction,
)

group_messages_router = APIRouter(tags=["chat"])
messages_router = APIRouter(tags=["chat"])


# ── Helpers ───────────────────────────────────────────────────────────────────


def _message_to_response(
    msg: object,
    current_user_id: uuid.UUID,
    reply_count: int = 0,
) -> ChatMessageResponse:
    """Convert a GroupMessage ORM object to ChatMessageResponse."""
    reaction_map: dict[str, dict] = {}
    for r in msg.reactions:
        if r.emoji not in reaction_map:
            reaction_map[r.emoji] = {"count": 0, "did_i_react": False}
        reaction_map[r.emoji]["count"] += 1
        if r.user_id == current_user_id:
            reaction_map[r.emoji]["did_i_react"] = True

    reactions = [
        ReactionSummary(emoji=emoji, count=v["count"], did_i_react=v["did_i_react"])
        for emoji, v in reaction_map.items()
    ]

    author = MessageAuthor(
        user_id=str(msg.user.id),
        username=msg.user.username,
        display_name=getattr(msg.user, "display_name", None),
        avatar_url=getattr(msg.user, "avatar_url", None),
    )

    return ChatMessageResponse(
        id=str(msg.id),
        group_id=str(msg.group_id),
        round_id=str(msg.round_id) if msg.round_id else None,
        author=author,
        content_type=msg.content_type,
        content_text=None if msg.is_deleted else msg.content_text,
        content_rich_json=None if msg.is_deleted else msg.content_rich_json,
        media_url=None if msg.is_deleted else msg.media_url,
        thumbnail_url=None if msg.is_deleted else msg.thumbnail_url,
        reference_type=msg.reference_type,
        reference_value=msg.reference_value,
        is_spoiler=msg.is_spoiler,
        spoiler_chapter=msg.spoiler_chapter,
        parent_message_id=str(msg.parent_message_id) if msg.parent_message_id else None,
        reply_count=reply_count,
        reactions=reactions,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
        is_deleted=msg.is_deleted,
    )


async def _reload_and_respond(
    db: object,
    message_id: uuid.UUID,
    current_user_id: uuid.UUID,
) -> ChatMessageResponse:
    """Reload a GroupMessage with relationships and convert to response."""
    result = await db.execute(
        select(GroupMessage)
        .options(
            selectinload(GroupMessage.reactions).selectinload(MessageReaction.user),
            selectinload(GroupMessage.user),
        )
        .where(GroupMessage.id == message_id)
    )
    return _message_to_response(result.scalar_one(), current_user_id)


# ── /groups/{group_id}/messages ───────────────────────────────────────────────


@group_messages_router.get(
    "",
    response_model=MessageListResponse,
    summary="Listar mensagens do grupo",
)
@limiter.limit("30/minute")
async def list_group_messages(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
    cursor: str | None = Query(default=None, description="ISO8601 timestamp cursor"),
    limit: int = Query(default=30, ge=1, le=100),
    round_id: uuid.UUID | None = Query(default=None),  # noqa: B008
    reference_type: str | None = Query(default=None),
) -> MessageListResponse:
    """Lista mensagens do grupo com paginação cursor-based (mais recentes primeiro)."""
    try:
        messages, reply_counts, next_cursor = await list_messages(
            db,
            group_id=group_id,
            user_id=current_user.id,
            cursor=cursor,
            limit=limit,
            round_id=round_id,
            reference_type=reference_type,
        )
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return MessageListResponse(
        messages=[
            _message_to_response(m, current_user.id, reply_count=reply_counts.get(m.id, 0))
            for m in messages
        ],
        next_cursor=next_cursor,
    )


@group_messages_router.post(
    "/typing",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Indicador de digitação",
)
@limiter.limit("20/minute")
async def send_typing_indicator(
    request: Request,
    group_id: uuid.UUID,
    _member: GroupMemberDep,
    current_user: CurrentUser,
) -> Response:
    """Emite evento de typing para o grupo via Redis Stream."""
    await emit_typing_event(
        group_id=group_id,
        user_id=current_user.id,
        display_name=current_user.display_name or current_user.username or "",
        avatar_url=current_user.avatar_url or "",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@group_messages_router.post(
    "",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar mensagem",
)
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    group_id: uuid.UUID,
    body: MessageCreateRequest,
    _member: GroupMemberDep,
    current_user: CurrentUser,
    db: DBSession,
    background_tasks: BackgroundTasks,
) -> ChatMessageResponse:
    """Envia uma nova mensagem no chat do grupo."""
    try:
        msg = await create_message(db, group_id=group_id, user_id=current_user.id, data=body)
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    background_tasks.add_task(
        check_and_award_badges,
        str(current_user.id),
        "message_sent",
        {"group_id": str(group_id)},
    )

    return await _reload_and_respond(db, msg.id, current_user.id)


# ── /messages ─────────────────────────────────────────────────────────────────


@messages_router.patch(
    "/{message_id}",
    response_model=ChatMessageResponse,
    summary="Editar mensagem",
)
@limiter.limit("20/minute")
async def edit_message_endpoint(
    request: Request,
    message_id: uuid.UUID,
    body: MessageEditRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> ChatMessageResponse:
    """Edita o conteúdo de uma mensagem (janela de 15 minutos)."""
    try:
        msg = await edit_message(db, message_id=message_id, user_id=current_user.id, data=body)
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return await _reload_and_respond(db, msg.id, current_user.id)


@messages_router.delete(
    "/{message_id}",
    response_model=ChatMessageResponse,
    summary="Apagar mensagem",
)
@limiter.limit("20/minute")
async def delete_message_endpoint(
    request: Request,
    message_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> ChatMessageResponse:
    """Soft-delete de mensagem (marca como apagada, não remove do banco)."""
    try:
        msg = await delete_message(db, message_id=message_id, user_id=current_user.id)
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return await _reload_and_respond(db, msg.id, current_user.id)


@messages_router.post(
    "/{message_id}/reactions",
    response_model=ChatMessageResponse,
    summary="Toggle reaction",
)
@limiter.limit("30/minute")
async def toggle_reaction_endpoint(
    request: Request,
    message_id: uuid.UUID,
    body: ReactionRequest,
    current_user: CurrentUser,
    db: DBSession,
) -> ChatMessageResponse:
    """Adiciona ou remove uma reaction (toggle). Retorna a mensagem atualizada."""
    try:
        await toggle_reaction(
            db, message_id=message_id, user_id=current_user.id, emoji=body.emoji
        )
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return await _reload_and_respond(db, message_id, current_user.id)


@messages_router.delete(
    "/{message_id}/reactions/{emoji}",
    response_model=ChatMessageResponse,
    summary="Remover reaction",
)
@limiter.limit("30/minute")
async def remove_reaction_endpoint(
    request: Request,
    message_id: uuid.UUID,
    emoji: str,
    current_user: CurrentUser,
    db: DBSession,
) -> ChatMessageResponse:
    """Remove uma reaction específica do usuário."""
    try:
        await remove_reaction(
            db, message_id=message_id, user_id=current_user.id, emoji=emoji
        )
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return await _reload_and_respond(db, message_id, current_user.id)


@messages_router.get(
    "/{message_id}/reactions",
    response_model=ReactionListResponse,
    summary="Listar reactions",
)
@limiter.limit("30/minute")
async def list_reactions_endpoint(
    request: Request,
    message_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
) -> ReactionListResponse:
    """Lista reactions de uma mensagem com detalhes dos usuários."""
    try:
        reactions = await list_reactions(db, message_id=message_id, user_id=current_user.id)
    except ChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return ReactionListResponse(
        reactions=[
            ReactionDetail(
                id=str(r.id),
                emoji=r.emoji,
                user_id=str(r.user_id),
                username=r.user.username,
                display_name=getattr(r.user, "display_name", None),
                created_at=r.created_at,
            )
            for r in reactions
        ]
    )
