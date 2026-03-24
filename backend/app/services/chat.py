"""Chat service — group messages and reactions."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.schemas.message import MessageCreateRequest, MessageEditRequest

from app.core.redis import get_redis

from app.core.exceptions import ServiceError
from app.db.models.group import GroupMember
from app.db.models.hall_of_quote import HallOfQuote
from app.db.models.message import ContentType, GroupMessage, MessageReaction
from app.security.sanitizer import sanitize
from app.security.tiptap import sanitize_tiptap_json
from app.services.group_helpers import emit_group_event

logger = structlog.get_logger(__name__)

_EDIT_WINDOW_MINUTES = 15
_FLOOD_KEY_PREFIX = "chat_flood:"
_FLOOD_WINDOW_SECONDS = 60
_FLOOD_MAX_MESSAGES = 10
_DEDUP_KEY_PREFIX = "chat_dedup:"
_DEDUP_TTL_SECONDS = 30


class ChatError(ServiceError):
    """Raised when chat validation fails."""


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _check_flood(user_id: uuid.UUID, group_id: uuid.UUID, content_hash: str) -> None:
    """Raise ChatError if the user is flooding the chat or sending duplicate messages.

    Two checks:
      1. Rate limit — max 10 messages per 60-second sliding window per user/group.
      2. Dedup — reject if the same content hash was sent in the last 30 seconds.
    """
    redis = get_redis()
    flood_key = f"{_FLOOD_KEY_PREFIX}{user_id}:{group_id}"
    dedup_key = f"{_DEDUP_KEY_PREFIX}{user_id}:{group_id}:{content_hash}"

    # Duplicate check
    is_dup = await redis.set(dedup_key, "1", ex=_DEDUP_TTL_SECONDS, nx=True)
    if is_dup is None:
        raise ChatError("Mensagem duplicada. Aguarde antes de reenviar.", status_code=429)

    # Flood check (INCR + EXPIRE pattern)
    count = await redis.incr(flood_key)
    if count == 1:
        await redis.expire(flood_key, _FLOOD_WINDOW_SECONDS)
    if count > _FLOOD_MAX_MESSAGES:
        raise ChatError(
            "Muitas mensagens em pouco tempo. Aguarde um momento.",
            status_code=429,
        )


async def _check_membership(db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Raise ChatError 404 if user is not a member of the group."""
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise ChatError("Clube não encontrado.", status_code=404)


async def _emit_chat_event(group_id: uuid.UUID, event_data: dict[str, str]) -> None:
    """Delegate to shared emit_group_event."""
    await emit_group_event(group_id, event_data)


async def emit_typing_event(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    display_name: str,
    avatar_url: str,
) -> None:
    """Emit a typing indicator event to the group chat stream."""
    await _emit_chat_event(
        group_id,
        {
            "type": "user_typing",
            "user_id": str(user_id),
            "display_name": display_name,
            "avatar_url": avatar_url,
        },
    )



# ── Service functions ─────────────────────────────────────────────────────────


async def create_message(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MessageCreateRequest,
) -> GroupMessage:
    """Create a new chat message. Validates membership and sanitizes content."""
    await _check_membership(db, group_id, user_id)

    # Flood + dedup protection (hash content early, before sanitize, to be consistent)
    _raw_content = (data.content_text or "") + str(data.content_rich_json or "")
    _content_hash = hashlib.sha256(_raw_content.encode()).hexdigest()[:16]
    await _check_flood(user_id, group_id, _content_hash)

    clean_text = sanitize(data.content_text) if data.content_text else None
    clean_rich = sanitize_tiptap_json(data.content_rich_json) if data.content_rich_json else None

    # Validate parent_message_id belongs to same group
    parent_id: uuid.UUID | None = None
    if data.parent_message_id:
        parent_id = uuid.UUID(data.parent_message_id)
        parent_result = await db.execute(
            select(GroupMessage).where(GroupMessage.id == parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None or parent.group_id != group_id:
            raise ChatError("Mensagem pai não encontrada neste grupo.", status_code=404)

    # Validate round_id belongs to same group
    round_id: uuid.UUID | None = None
    if data.round_id:
        from app.db.models.round import Round

        round_id = uuid.UUID(data.round_id)
        round_result = await db.execute(select(Round).where(Round.id == round_id))
        round_ = round_result.scalar_one_or_none()
        if round_ is None or round_.group_id != group_id:
            raise ChatError("Rodada não encontrada neste grupo.", status_code=404)

    msg = GroupMessage(
        group_id=group_id,
        user_id=user_id,
        round_id=round_id,
        content_type=data.content_type,
        content_text=clean_text,
        content_rich_json=clean_rich,
        media_url=data.media_url,
        thumbnail_url=data.thumbnail_url,
        reference_type=data.reference_type,
        reference_value=data.reference_value,
        is_spoiler=data.is_spoiler,
        spoiler_chapter=data.spoiler_chapter,
        parent_message_id=parent_id,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    # Auto-create Hall of Quotes entry for quote-type messages
    if data.content_type == ContentType.QUOTE and clean_text:
        await _auto_create_hall_of_quote(db, msg, group_id, user_id, round_id, clean_text)

    await _emit_chat_event(
        group_id,
        {
            "type": "message_created",
            "message_id": str(msg.id),
            "user_id": str(user_id),
        },
    )

    # Emit to notifications stream for digest worker
    try:
        _redis = get_redis()
        await _redis.xadd(
            "bookclub:notifications",
            {
                "type": "new_message",
                "group_id": str(group_id),
                "user_id": str(user_id),
                "message_id": str(msg.id),
            },
            maxlen=50000,
            approximate=True,
        )
    except Exception:
        logger.warning("notification_xadd_failed", message_id=str(msg.id))

    logger.info("chat_message_created", message_id=str(msg.id), group_id=str(group_id))
    return msg


async def _auto_create_hall_of_quote(
    db: AsyncSession,
    msg: GroupMessage,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    round_id: uuid.UUID | None,
    quote_text: str,
) -> None:
    """Auto-create a HallOfQuote entry from a quote-type chat message."""
    try:
        from app.db.models.round import Round

        book_title = "Leitura do grupo"
        book_author: str | None = None
        page_reference: str | None = None

        if round_id:
            round_result = await db.execute(select(Round).where(Round.id == round_id))
            round_ = round_result.scalar_one_or_none()
            if round_ and round_.book_title:
                book_title = round_.book_title
                book_author = round_.book_author
        elif msg.reference_value:
            page_reference = msg.reference_value

        hall_quote = HallOfQuote(
            group_id=group_id,
            round_id=round_id,
            user_id=user_id,
            quote_text=quote_text,
            page_reference=page_reference,
            book_title=book_title,
            book_author=book_author,
        )
        db.add(hall_quote)
        await db.flush()
    except Exception:
        logger.warning(
            "auto_hall_of_quote_failed",
            message_id=str(msg.id),
            group_id=str(group_id),
        )


async def edit_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MessageEditRequest,
) -> GroupMessage:
    """Edit a message within the 15-minute edit window."""
    result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if msg is None or msg.user_id != user_id:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    if msg.is_deleted:
        raise ChatError("Não é possível editar uma mensagem apagada.", status_code=409)

    created_at = msg.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    if datetime.now(UTC) - created_at > timedelta(minutes=_EDIT_WINDOW_MINUTES):
        raise ChatError("A janela de edição de 15 minutos expirou.", status_code=409)

    if data.content_text is not None:
        msg.content_text = sanitize(data.content_text)
    if data.content_rich_json is not None:
        msg.content_rich_json = sanitize_tiptap_json(data.content_rich_json)
    msg.updated_at = datetime.now(UTC)

    await db.flush()
    await db.refresh(msg)

    await _emit_chat_event(
        msg.group_id,
        {"type": "message_edited", "message_id": str(msg.id), "user_id": str(user_id)},
    )
    return msg


async def delete_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
) -> GroupMessage:
    """Soft-delete a message (sets is_deleted=True)."""
    result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if msg is None or msg.user_id != user_id:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    if msg.is_deleted:
        raise ChatError("Mensagem já foi apagada.", status_code=409)

    msg.is_deleted = True
    msg.updated_at = datetime.now(UTC)

    await db.flush()
    await db.refresh(msg)

    await _emit_chat_event(
        msg.group_id,
        {"type": "message_deleted", "message_id": str(msg.id), "user_id": str(user_id)},
    )
    return msg


async def list_messages(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 30,
    round_id: uuid.UUID | None = None,
    reference_type: str | None = None,
) -> tuple[list[GroupMessage], dict[uuid.UUID, int], str | None]:
    """List messages for a group with cursor-based pagination (newest first).

    Returns (messages, reply_counts_by_message_id, next_cursor).
    """
    await _check_membership(db, group_id, user_id)

    filters = [GroupMessage.group_id == group_id]
    if cursor is not None:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            filters.append(GroupMessage.created_at < cursor_dt)
        except ValueError:
            pass
    if round_id is not None:
        filters.append(GroupMessage.round_id == round_id)
    if reference_type is not None:
        filters.append(GroupMessage.reference_type == reference_type)

    stmt = (
        select(GroupMessage)
        .options(
            selectinload(GroupMessage.reactions).selectinload(MessageReaction.user),
            selectinload(GroupMessage.user),
        )
        .where(*filters)
        .order_by(GroupMessage.created_at.desc())
        .limit(limit + 1)
    )
    result = await db.execute(stmt)
    messages = list(result.scalars().all())

    next_cursor: str | None = None
    if len(messages) > limit:
        messages = messages[:limit]
        next_cursor = messages[-1].created_at.isoformat()

    reply_counts: dict[uuid.UUID, int] = {}
    if messages:
        msg_ids = [m.id for m in messages]
        counts_result = await db.execute(
            select(GroupMessage.parent_message_id, func.count(GroupMessage.id))
            .where(
                GroupMessage.parent_message_id.in_(msg_ids),
                GroupMessage.is_deleted.is_(False),
            )
            .group_by(GroupMessage.parent_message_id)
        )
        reply_counts = {row[0]: row[1] for row in counts_result}

    return messages, reply_counts, next_cursor


async def toggle_reaction(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
    emoji: str,
) -> tuple[bool, uuid.UUID]:
    """Toggle a reaction on a message. Returns (added, group_id)."""
    msg_result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = msg_result.scalar_one_or_none()
    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    if msg.is_deleted:
        raise ChatError("Não é possível reagir a uma mensagem apagada.", status_code=409)

    await _check_membership(db, msg.group_id, user_id)

    existing_result = await db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user_id,
            MessageReaction.emoji == emoji,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        await db.delete(existing)
        await db.flush()
        await _emit_chat_event(
            msg.group_id,
            {
                "type": "reaction_removed",
                "message_id": str(message_id),
                "user_id": str(user_id),
                "emoji": emoji,
            },
        )
        return False, msg.group_id

    reaction = MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
    db.add(reaction)
    await db.flush()
    await _emit_chat_event(
        msg.group_id,
        {
            "type": "reaction_added",
            "message_id": str(message_id),
            "user_id": str(user_id),
            "emoji": emoji,
        },
    )
    return True, msg.group_id


async def remove_reaction(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
    emoji: str,
) -> uuid.UUID:
    """Remove a specific reaction. Returns group_id."""
    result = await db.execute(
        select(MessageReaction, GroupMessage.group_id)
        .join(GroupMessage, GroupMessage.id == MessageReaction.message_id)
        .where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user_id,
            MessageReaction.emoji == emoji,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise ChatError("Reação não encontrada.", status_code=404)
    reaction, group_id = row

    await db.delete(reaction)
    await db.flush()

    await _emit_chat_event(
        group_id,
        {
            "type": "reaction_removed",
            "message_id": str(message_id),
            "user_id": str(user_id),
            "emoji": emoji,
        },
    )
    return group_id


async def list_reactions(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[MessageReaction]:
    """List reactions for a message. Verifies membership."""
    msg_result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = msg_result.scalar_one_or_none()
    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)

    await _check_membership(db, msg.group_id, user_id)

    result = await db.execute(
        select(MessageReaction)
        .options(selectinload(MessageReaction.user))
        .where(MessageReaction.message_id == message_id)
    )
    return list(result.scalars().all())
