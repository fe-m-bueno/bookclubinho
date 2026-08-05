"""Testes unitários para app.services.chat."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat import (
    ChatError,
    create_message,
    delete_message,
    edit_message,
    list_messages,
    list_reactions,
    remove_reaction,
    toggle_reaction,
)
from app.services.membership import MembershipError
from tests.conftest import RecordingAfterCommit

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def mock_check_flood():
    """Bypass Redis flood check in all chat service unit tests."""
    with patch("app.services.chat._check_flood", new=AsyncMock()):
        yield


# ── Mock factories ─────────────────────────────────────────────────────────────


def _make_group(**overrides: object) -> MagicMock:
    g = MagicMock()
    g.id = overrides.get("id", uuid.uuid4())
    g.is_active = overrides.get("is_active", True)
    return g


def _make_member(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.id = overrides.get("id", uuid.uuid4())
    m.user_id = overrides.get("user_id", uuid.uuid4())
    m.group_id = overrides.get("group_id", uuid.uuid4())
    return m


def _make_message(**overrides: object) -> MagicMock:
    group_id = overrides.get("group_id", uuid.uuid4())
    msg = MagicMock()
    msg.id = overrides.get("id", uuid.uuid4())
    msg.group_id = group_id
    msg.user_id = overrides.get("user_id", uuid.uuid4())
    msg.round_id = overrides.get("round_id")
    msg.content_type = overrides.get("content_type", "text")
    msg.content_text = overrides.get("content_text", "Hello!")
    msg.content_rich_json = overrides.get("content_rich_json")
    msg.media_url = overrides.get("media_url")
    msg.is_spoiler = overrides.get("is_spoiler", False)
    msg.is_deleted = overrides.get("is_deleted", False)
    msg.created_at = overrides.get("created_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    msg.updated_at = overrides.get("updated_at")
    msg.reactions = overrides.get("reactions", [])
    return msg


def _make_reaction(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.id = overrides.get("id", uuid.uuid4())
    r.message_id = overrides.get("message_id", uuid.uuid4())
    r.user_id = overrides.get("user_id", uuid.uuid4())
    r.emoji = overrides.get("emoji", "👍")
    r.created_at = overrides.get("created_at", datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC))
    return r


def _make_create_request(**overrides: object) -> MagicMock:
    req = MagicMock()
    req.content_type = overrides.get("content_type", "text")
    req.content_text = overrides.get("content_text", "Hello!")
    req.content_rich_json = overrides.get("content_rich_json")
    req.media_url = overrides.get("media_url")
    req.thumbnail_url = overrides.get("thumbnail_url")
    req.reference_type = overrides.get("reference_type")
    req.reference_value = overrides.get("reference_value")
    req.is_spoiler = overrides.get("is_spoiler", False)
    req.spoiler_chapter = overrides.get("spoiler_chapter")
    req.parent_message_id = overrides.get("parent_message_id")
    req.round_id = overrides.get("round_id")
    return req


def _make_edit_request(**overrides: object) -> MagicMock:
    req = MagicMock()
    req.content_text = overrides.get("content_text", "Edited!")
    req.content_rich_json = overrides.get("content_rich_json")
    return req


# ── create_message ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_text_message_success() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)
    data = _make_create_request(content_text="Hello world!")

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(return_value=res_member)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    msg = await create_message(db, after_commit=RecordingAfterCommit(), group_id=group_id, user_id=user_id, data=data)

    db.add.assert_called_once()
    db.flush.assert_called_once()
    db.refresh.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.user_id == user_id
    assert added.group_id == group_id


@pytest.mark.asyncio
async def test_create_message_not_member_raises_404() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    data = _make_create_request()
    with pytest.raises(MembershipError) as exc_info:
        await create_message(
            db, after_commit=RecordingAfterCommit(), group_id=uuid.uuid4(), user_id=uuid.uuid4(), data=data
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_message_sanitizes_content_text() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)
    data = _make_create_request(content_text="<script>evil()</script>Hello")

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(return_value=res_member)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    with (
        patch("app.services.chat.sanitize", return_value="Hello") as mock_sanitize,
    ):
        await create_message(db, after_commit=RecordingAfterCommit(), group_id=group_id, user_id=user_id, data=data)

    mock_sanitize.assert_called_once_with("<script>evil()</script>Hello")


@pytest.mark.asyncio
async def test_create_message_with_parent_in_different_group_raises() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    other_group_id = uuid.uuid4()
    parent_id = uuid.uuid4()

    member = _make_member(user_id=user_id, group_id=group_id)
    parent_msg = _make_message(group_id=other_group_id)  # different group!

    data = _make_create_request(parent_message_id=str(parent_id))

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_parent = MagicMock()
    res_parent.scalar_one_or_none.return_value = parent_msg
    db.execute = AsyncMock(side_effect=[res_member, res_parent])

    with pytest.raises(ChatError) as exc_info:
        await create_message(db, after_commit=RecordingAfterCommit(), group_id=group_id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 404


# ── edit_message ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_edit_message_success_within_window() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(
        user_id=user_id,
        is_deleted=False,
        created_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    data = _make_edit_request(content_text="Updated text")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    with (
        patch("app.services.chat.sanitize", return_value="Updated text"),
    ):
        result = await edit_message(
            db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, data=data
        )

    assert result is msg
    assert msg.content_text == "Updated text"
    assert msg.updated_at is not None


@pytest.mark.asyncio
async def test_edit_message_after_15_min_raises() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(
        user_id=user_id,
        is_deleted=False,
        created_at=datetime.now(UTC) - timedelta(minutes=20),
    )
    data = _make_edit_request()

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await edit_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 409
    assert "15" in str(exc_info.value)


@pytest.mark.asyncio
async def test_edit_message_wrong_owner_raises_404() -> None:
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    msg = _make_message(user_id=owner_id, is_deleted=False)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)
    data = _make_edit_request()

    with pytest.raises(ChatError) as exc_info:
        await edit_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=other_id, data=data)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_edit_message_by_ex_member_raises_404() -> None:
    """Sair do clube revoga o direito de mexer nas próprias mensagens deixadas lá.

    Antes de #208 estas duas funções checavam só autoria: o autor continuava
    editando mesmo sem linha em GroupMember.
    """
    author_id = uuid.uuid4()
    # created_at recente de propósito: dentro da janela de 15 min, para que a
    # única coisa capaz de barrar a edição seja a falta de membership.
    msg = _make_message(
        user_id=author_id,
        is_deleted=False,
        created_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    original_text = msg.content_text
    data = _make_edit_request()

    db = AsyncMock()
    res_msg = MagicMock()
    res_msg.scalar_one_or_none.return_value = msg
    res_no_member = MagicMock()
    res_no_member.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[res_msg, res_no_member])

    with pytest.raises(MembershipError) as exc_info:
        await edit_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=author_id, data=data)
    assert exc_info.value.status_code == 404
    assert msg.content_text == original_text


@pytest.mark.asyncio
async def test_edit_deleted_message_raises() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(
        user_id=user_id,
        is_deleted=True,
        created_at=datetime.now(UTC) - timedelta(minutes=2),
    )
    data = _make_edit_request()

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await edit_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, data=data)
    assert exc_info.value.status_code == 409


# ── delete_message ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_message_success() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(user_id=user_id, is_deleted=False)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    result = await delete_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id)

    assert result is msg
    assert msg.is_deleted is True
    assert msg.updated_at is not None


@pytest.mark.asyncio
async def test_delete_message_wrong_owner_raises_404() -> None:
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    msg = _make_message(user_id=owner_id, is_deleted=False)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await delete_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=other_id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_message_by_ex_member_raises_404() -> None:
    """delete_message não tem janela de tempo — sem esta checagem um ex-membro
    apagaria mensagens antigas dele indefinidamente (#208)."""
    author_id = uuid.uuid4()
    msg = _make_message(user_id=author_id, is_deleted=False)

    db = AsyncMock()
    res_msg = MagicMock()
    res_msg.scalar_one_or_none.return_value = msg
    res_no_member = MagicMock()
    res_no_member.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[res_msg, res_no_member])

    with pytest.raises(MembershipError) as exc_info:
        await delete_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=author_id)
    assert exc_info.value.status_code == 404
    assert msg.is_deleted is False


@pytest.mark.asyncio
async def test_delete_already_deleted_raises() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(user_id=user_id, is_deleted=True)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await delete_message(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id)
    assert exc_info.value.status_code == 409


# ── list_messages ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_messages_paginated() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)
    messages = [_make_message(group_id=group_id) for _ in range(3)]

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_messages = MagicMock()
    res_messages.scalars.return_value.all.return_value = messages
    res_counts = MagicMock()
    res_counts.__iter__ = MagicMock(return_value=iter([]))
    db.execute = AsyncMock(side_effect=[res_member, res_messages, res_counts])

    result, reply_counts, next_cursor = await list_messages(db, group_id=group_id, user_id=user_id, limit=10)

    assert len(result) == 3
    assert reply_counts == {}
    assert next_cursor is None


@pytest.mark.asyncio
async def test_list_messages_with_cursor() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)
    limit = 2
    # Return 3 messages to trigger cursor (limit+1)
    messages = [
        _make_message(
            group_id=group_id,
            created_at=datetime(2026, 3, 19, 10, i, 0, tzinfo=UTC),
        )
        for i in range(3)
    ]

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_messages = MagicMock()
    res_messages.scalars.return_value.all.return_value = messages
    res_counts = MagicMock()
    res_counts.__iter__ = MagicMock(return_value=iter([]))
    db.execute = AsyncMock(side_effect=[res_member, res_messages, res_counts])

    result, _reply_counts, next_cursor = await list_messages(db, group_id=group_id, user_id=user_id, limit=limit)

    assert len(result) == 2
    assert next_cursor is not None


@pytest.mark.asyncio
async def test_list_messages_filters_round_and_reference() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    round_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)

    db = AsyncMock()
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_messages = MagicMock()
    res_messages.scalars.return_value.all.return_value = []
    res_counts = MagicMock()
    res_counts.__iter__ = MagicMock(return_value=iter([]))
    db.execute = AsyncMock(side_effect=[res_member, res_messages, res_counts])

    result, _reply_counts, next_cursor = await list_messages(
        db,
        group_id=group_id,
        user_id=user_id,
        round_id=round_id,
        reference_type="chapter",
    )

    assert result == []
    assert next_cursor is None


# ── toggle_reaction ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_toggle_reaction_adds_new() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    msg = _make_message(group_id=group_id, is_deleted=False)
    member = _make_member(user_id=user_id, group_id=group_id)

    db = AsyncMock()
    res_msg = MagicMock()
    res_msg.scalar_one_or_none.return_value = msg
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = None  # no existing reaction
    db.execute = AsyncMock(side_effect=[res_msg, res_member, res_existing])
    db.add = MagicMock()
    db.flush = AsyncMock()

    added, returned_group_id = await toggle_reaction(
        db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, emoji="👍"
    )

    assert added is True
    assert returned_group_id == group_id
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_toggle_reaction_removes_existing() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    msg = _make_message(group_id=group_id, is_deleted=False)
    member = _make_member(user_id=user_id, group_id=group_id)
    existing = _make_reaction(user_id=user_id, emoji="👍")

    db = AsyncMock()
    res_msg = MagicMock()
    res_msg.scalar_one_or_none.return_value = msg
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_existing = MagicMock()
    res_existing.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(side_effect=[res_msg, res_member, res_existing])
    db.delete = AsyncMock()
    db.flush = AsyncMock()

    added, returned_group_id = await toggle_reaction(
        db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, emoji="👍"
    )

    assert added is False
    assert returned_group_id == group_id
    db.delete.assert_called_once_with(existing)


@pytest.mark.asyncio
async def test_toggle_reaction_on_deleted_message_raises() -> None:
    user_id = uuid.uuid4()
    msg = _make_message(is_deleted=True)

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = msg
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await toggle_reaction(db, after_commit=RecordingAfterCommit(), message_id=msg.id, user_id=user_id, emoji="👍")
    assert exc_info.value.status_code == 409


# ── remove_reaction ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_remove_reaction_not_found_raises_404() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)

    with pytest.raises(ChatError) as exc_info:
        await remove_reaction(
            db, after_commit=RecordingAfterCommit(), message_id=uuid.uuid4(), user_id=uuid.uuid4(), emoji="👍"
        )
    assert exc_info.value.status_code == 404


# ── list_reactions ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_reactions_returns_with_user_details() -> None:
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    msg = _make_message(group_id=group_id)
    member = _make_member(user_id=user_id, group_id=group_id)

    user = MagicMock()
    user.username = "testuser"
    user.display_name = "Test User"

    reaction = _make_reaction(message_id=msg.id, emoji="❤️")
    reaction.user = user

    db = AsyncMock()
    res_msg = MagicMock()
    res_msg.scalar_one_or_none.return_value = msg
    res_member = MagicMock()
    res_member.scalar_one_or_none.return_value = member
    res_reactions = MagicMock()
    res_reactions.scalars.return_value.all.return_value = [reaction]
    db.execute = AsyncMock(side_effect=[res_msg, res_member, res_reactions])

    result = await list_reactions(db, message_id=msg.id, user_id=user_id)

    assert len(result) == 1
    assert result[0].emoji == "❤️"
    assert result[0].user.username == "testuser"


# ── Eventos agendados (#204) ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_message_schedules_chat_and_notification_events(after_commit) -> None:
    """Os eventos vão pelo AfterCommit: quando o outro cliente recebe
    "mensagem criada" e refaz o fetch, a linha já existe."""
    user_id = uuid.uuid4()
    group_id = uuid.uuid4()
    member = _make_member(user_id=user_id, group_id=group_id)
    data = _make_create_request(content_text="Olá")

    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(return_value=res)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    await create_message(db, after_commit=after_commit, group_id=group_id, user_id=user_id, data=data)

    assert after_commit.published == ["message_created", "new_message"]
    assert after_commit.event_types == ["message_sent"]  # badge


@pytest.mark.asyncio
async def test_typing_publishes_inline(after_commit) -> None:
    """Digitação não participa de transação — não há o que esperar commitar."""
    from app.services.chat import emit_typing_event

    group_id = uuid.uuid4()
    with patch("app.services.group_events.get_redis", return_value=AsyncMock()) as mock:
        await emit_typing_event(group_id, uuid.uuid4(), "Felipe", "http://a")

    assert mock.called
    assert after_commit.scheduled == []
