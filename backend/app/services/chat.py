"""Chat service — group messages and reactions."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.after_commit import AfterCommit
    from app.schemas.message import MessageCreateRequest, MessageEditRequest

from app.core.exceptions import ServiceError
from app.core.redis import get_redis
from app.db.models.hall_of_quote import HallOfQuote
from app.db.models.message import ContentType, GroupMessage, MessageReaction
from app.security.sanitizer import sanitize
from app.security.tiptap import sanitize_tiptap_json
from app.services import group_events, membership
from app.services.badge_checker import check_and_award_badges
from app.services.group_events import GroupEvent

logger = structlog.get_logger(__name__)

_EDIT_WINDOW_MINUTES = 15
_FLOOD_KEY_PREFIX = "chat_flood:"
_FLOOD_WINDOW_SECONDS = 60
_FLOOD_MAX_MESSAGES = 10
_DEDUP_KEY_PREFIX = "chat_dedup:"
_DEDUP_TTL_SECONDS = 30
# media/{group_uuid}/{file_uuid}[_thumb].{ext} — nada de barras ou ".." extras.
_MEDIA_KEY_RE = re.compile(r"media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}(_thumb)?\.(webp|gif)")


class ChatError(ServiceError):
    """Raised when chat validation fails."""


# ── Helpers ───────────────────────────────────────────────────────────────────


def _validate_media_key(key: str, group_id: uuid.UUID) -> str:
    """Garante que a chave aponta para a pasta de mídia deste grupo.

    O cliente devolve a chave que o upload gerou; sem esta checagem ele poderia
    apontar a mensagem para a mídia de outro grupo (ou para qualquer caminho do
    bucket). O nome do arquivo é limitado ao que o upload produz: uuid, sufixo
    `_thumb` e extensão.
    """
    if not _MEDIA_KEY_RE.fullmatch(key) or not key.startswith(f"media/{group_id}/"):
        raise ChatError("Chave de mídia inválida para este grupo.", status_code=400)
    return key


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


async def emit_typing_event(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    display_name: str,
    avatar_url: str,
) -> None:
    """Emit a typing indicator.

    Publica inline, ao contrário dos outros: não há transação para esperar — o
    endpoint de digitação não escreve nada.
    """
    await group_events.publish(
        group_id,
        GroupEvent.user_typing(user_id=user_id, display_name=display_name, avatar_url=avatar_url),
    )


# ── Service functions ─────────────────────────────────────────────────────────


async def create_message(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    data: MessageCreateRequest,
    *,
    after_commit: AfterCommit,
) -> GroupMessage:
    """Create a new chat message. Validates membership and sanitizes content."""
    await membership.resolve(db, group_id, user_id)

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
        parent_result = await db.execute(select(GroupMessage).where(GroupMessage.id == parent_id))
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

    media_key = _validate_media_key(data.media_key, group_id) if data.media_key else None
    thumbnail_key = _validate_media_key(data.thumbnail_key, group_id) if data.thumbnail_key else None

    msg = GroupMessage(
        group_id=group_id,
        user_id=user_id,
        round_id=round_id,
        content_type=data.content_type,
        content_text=clean_text,
        content_rich_json=clean_rich,
        media_key=media_key,
        thumbnail_key=thumbnail_key,
        media_url=data.media_url,
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

    after_commit.schedule(group_events.publish, group_id, GroupEvent.message_created(msg.id, user_id))
    after_commit.schedule(group_events.publish, group_id, GroupEvent.new_message(group_id, user_id, msg.id))

    after_commit.schedule(
        check_and_award_badges,
        str(user_id),
        "message_sent",
        {"group_id": str(group_id)},
    )

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
    """Auto-create a HallOfQuote entry from a quote-type chat message.

    Savepoint em volta do trabalho de banco: a entrada no hall é um brinde à
    mensagem, e sem ele um erro aqui aborta a transação em Postgres — a mensagem
    já gravada morre no commit, com um 500 que não menciona o hall.
    """
    try:
        from app.db.models.round import Round

        async with db.begin_nested():
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
    *,
    after_commit: AfterCommit,
) -> GroupMessage:
    """Edit a message within the 15-minute edit window."""
    result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    # Membership before authorship: leaving the club revokes the right to act on
    # messages left behind, even one's own.
    await membership.resolve(db, msg.group_id, user_id)
    if msg.user_id != user_id:
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

    after_commit.schedule(group_events.publish, msg.group_id, GroupEvent.message_edited(msg.id, user_id))
    return msg


async def delete_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    after_commit: AfterCommit,
) -> GroupMessage:
    """Soft-delete a message (sets is_deleted=True)."""
    result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    # Same rule as edit_message. delete_message has no time window, so without
    # this an ex-member could keep erasing old messages indefinitely.
    await membership.resolve(db, msg.group_id, user_id)
    if msg.user_id != user_id:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    if msg.is_deleted:
        raise ChatError("Mensagem já foi apagada.", status_code=409)

    msg.is_deleted = True
    msg.updated_at = datetime.now(UTC)

    await db.flush()
    await db.refresh(msg)

    after_commit.schedule(group_events.publish, msg.group_id, GroupEvent.message_deleted(msg.id, user_id))
    return msg


async def count_replies(db: AsyncSession, message_id: uuid.UUID) -> int:
    """Quantas respostas vivas uma mensagem tem.

    Mesma regra do `GROUP BY` de `list_messages` — respostas apagadas não contam
    —, só que para uma mensagem só. As rotas que devolvem uma mensagem depois de
    mutá-la precisam disso: sem ele o `reply_count` sai no default `0` e apaga o
    "3 respostas" da tela de quem confiar na resposta.
    """
    result = await db.execute(
        select(func.count(GroupMessage.id)).where(
            GroupMessage.parent_message_id == message_id,
            GroupMessage.is_deleted.is_(False),
        )
    )
    return result.scalar_one()


async def get_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[GroupMessage, int]:
    """Carrega uma mensagem só, com reações e autor. Returns (message, reply_count).

    Existe para o cliente aplicar um evento SSE — que traz só o `message_id` —
    sem refetchar a página inteira. Não-membro recebe 404 com a mesma mensagem de
    "não encontrada" que uma mensagem inexistente: quem não está no clube não
    descobre por aqui que a mensagem existe.
    """
    result = await db.execute(
        select(GroupMessage)
        .options(
            selectinload(GroupMessage.reactions).selectinload(MessageReaction.user),
            selectinload(GroupMessage.user),
        )
        .where(GroupMessage.id == message_id)
    )
    msg = result.scalar_one_or_none()
    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)

    await membership.resolve(db, msg.group_id, user_id, not_found_message="Mensagem não encontrada.")

    return msg, await count_replies(db, message_id)


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
    await membership.resolve(db, group_id, user_id)

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
    *,
    after_commit: AfterCommit,
) -> tuple[bool, uuid.UUID]:
    """Toggle a reaction on a message. Returns (added, group_id)."""
    msg_result = await db.execute(select(GroupMessage).where(GroupMessage.id == message_id))
    msg = msg_result.scalar_one_or_none()
    if msg is None:
        raise ChatError("Mensagem não encontrada.", status_code=404)
    if msg.is_deleted:
        raise ChatError("Não é possível reagir a uma mensagem apagada.", status_code=409)

    await membership.resolve(db, msg.group_id, user_id)

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
        after_commit.schedule(
            group_events.publish,
            msg.group_id,
            GroupEvent.reaction_removed(message_id, user_id, emoji),
        )
        return False, msg.group_id

    reaction = MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
    db.add(reaction)
    await db.flush()
    after_commit.schedule(
        group_events.publish,
        msg.group_id,
        GroupEvent.reaction_added(message_id, user_id, emoji),
    )
    return True, msg.group_id


async def remove_reaction(
    db: AsyncSession,
    message_id: uuid.UUID,
    user_id: uuid.UUID,
    emoji: str,
    *,
    after_commit: AfterCommit,
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

    after_commit.schedule(
        group_events.publish,
        group_id,
        GroupEvent.reaction_removed(message_id, user_id, emoji),
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

    await membership.resolve(db, msg.group_id, user_id)

    result = await db.execute(
        select(MessageReaction)
        .options(selectinload(MessageReaction.user))
        .where(MessageReaction.message_id == message_id)
    )
    return list(result.scalars().all())
