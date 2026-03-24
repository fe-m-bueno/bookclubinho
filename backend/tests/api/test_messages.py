"""Testes de endpoint para chat — /api/v1/groups/{group_id}/messages e /api/v1/messages."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.messages import group_messages_router, messages_router
from app.core.deps import get_current_active_user, get_group_membership, get_session
from app.services.chat import ChatError
from tests.conftest import make_user

# ── Fixtures ───────────────────────────────────────────────────────────────────

FAKE_GROUP_ID = uuid.uuid4()
FAKE_USER = make_user()
FAKE_DB = AsyncMock()
FAKE_MEMBER = MagicMock()
FAKE_MEMBER.user_id = FAKE_USER.id
FAKE_MEMBER.group_id = FAKE_GROUP_ID


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(
        group_messages_router,
        prefix="/api/v1/groups/{group_id}/messages",
    )
    app.include_router(messages_router, prefix="/api/v1/messages")
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    app.dependency_overrides[get_group_membership] = lambda: FAKE_MEMBER
    return app


def _make_chat_msg_response(**overrides: object) -> MagicMock:
    """Build a minimal ChatMessageResponse-like object for mock patches."""
    msg = MagicMock()
    msg.id = str(overrides.get("id", uuid.uuid4()))
    msg.group_id = str(FAKE_GROUP_ID)
    msg.round_id = None
    msg.content_type = "text"
    msg.content_text = overrides.get("content_text", "Hello!")
    msg.content_rich_json = None
    msg.media_url = None
    msg.thumbnail_url = None
    msg.reference_type = None
    msg.reference_value = None
    msg.is_spoiler = False
    msg.spoiler_chapter = None
    msg.parent_message_id = None
    msg.reply_count = 0
    msg.reactions = []
    msg.created_at = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)
    msg.updated_at = None
    msg.is_deleted = overrides.get("is_deleted", False)
    return msg


def _make_group_message_orm(**overrides: object) -> MagicMock:
    """Build a GroupMessage ORM mock with user relationship loaded."""
    msg = MagicMock()
    msg.id = overrides.get("id", uuid.uuid4())
    msg.group_id = FAKE_GROUP_ID
    msg.round_id = None
    msg.user_id = FAKE_USER.id
    msg.user = FAKE_USER
    msg.content_type = "text"
    msg.content_text = overrides.get("content_text", "Hello!")
    msg.content_rich_json = None
    msg.media_url = None
    msg.thumbnail_url = None
    msg.reference_type = None
    msg.reference_value = None
    msg.is_spoiler = False
    msg.spoiler_chapter = None
    msg.parent_message_id = None
    msg.reactions = []
    msg.created_at = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)
    msg.updated_at = None
    msg.is_deleted = overrides.get("is_deleted", False)
    # _reply_count stored in __dict__ by service
    msg.__dict__["_reply_count"] = 0
    return msg


# ── GET /groups/{group_id}/messages ───────────────────────────────────────────


class TestListMessages:
    def test_list_returns_200(self) -> None:
        app = _make_app()
        client = TestClient(app)

        msg = _make_group_message_orm()

        with patch(
            "app.api.v1.endpoints.messages.list_messages",
            new=AsyncMock(return_value=([msg], {}, None)),
        ):
            response = client.get(f"/api/v1/groups/{FAKE_GROUP_ID}/messages")

        assert response.status_code == 200
        data = response.json()
        assert "messages" in data
        assert len(data["messages"]) == 1
        assert data["next_cursor"] is None

    def test_list_with_cursor_pagination(self) -> None:
        app = _make_app()
        client = TestClient(app)
        cursor = "2026-03-19T10:00:00+00:00"

        with patch(
            "app.api.v1.endpoints.messages.list_messages",
            new=AsyncMock(return_value=([], {}, None)),
        ):
            response = client.get(f"/api/v1/groups/{FAKE_GROUP_ID}/messages?cursor={cursor}")

        assert response.status_code == 200

    def test_list_chat_error_returns_proper_status(self) -> None:
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.messages.list_messages",
            new=AsyncMock(side_effect=ChatError("Clube não encontrado.", status_code=404)),
        ):
            response = client.get(f"/api/v1/groups/{FAKE_GROUP_ID}/messages")

        assert response.status_code == 404


# ── POST /groups/{group_id}/messages ──────────────────────────────────────────


class TestSendMessage:
    def test_send_text_message_returns_201(self) -> None:
        app = _make_app()
        client = TestClient(app)
        msg = _make_group_message_orm()

        # Mock both create_message and the reload query
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = msg

        with (
            patch(
                "app.api.v1.endpoints.messages.create_message",
                new=AsyncMock(return_value=msg),
            ),
            patch.object(FAKE_DB, "execute", new=AsyncMock(return_value=mock_result)),
        ):
            response = client.post(
                f"/api/v1/groups/{FAKE_GROUP_ID}/messages",
                json={"content_type": "text", "content_text": "Hello!"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["content_type"] == "text"
        assert data["is_deleted"] is False

    def test_send_message_validation_error_returns_422(self) -> None:
        app = _make_app()
        client = TestClient(app)

        response = client.post(
            f"/api/v1/groups/{FAKE_GROUP_ID}/messages",
            json={"content_type": "image"},  # missing media_url
        )

        assert response.status_code == 422

    def test_send_message_chat_error_returns_proper_status(self) -> None:
        app = _make_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.messages.create_message",
            new=AsyncMock(side_effect=ChatError("Mensagem pai não encontrada.", status_code=404)),
        ):
            response = client.post(
                f"/api/v1/groups/{FAKE_GROUP_ID}/messages",
                json={"content_type": "text", "content_text": "Hi", "parent_message_id": str(uuid.uuid4())},
            )

        assert response.status_code == 404


# ── PATCH /messages/{message_id} ──────────────────────────────────────────────


class TestEditMessage:
    def test_edit_message_returns_200(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()
        msg = _make_group_message_orm(id=message_id, content_text="Updated!")
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = msg

        with (
            patch(
                "app.api.v1.endpoints.messages.edit_message",
                new=AsyncMock(return_value=msg),
            ),
            patch.object(FAKE_DB, "execute", new=AsyncMock(return_value=mock_result)),
        ):
            response = client.patch(
                f"/api/v1/messages/{message_id}",
                json={"content_text": "Updated!"},
            )

        assert response.status_code == 200

    def test_edit_expired_returns_409(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()

        with patch(
            "app.api.v1.endpoints.messages.edit_message",
            new=AsyncMock(side_effect=ChatError("A janela de edição de 15 minutos expirou.", status_code=409)),
        ):
            response = client.patch(
                f"/api/v1/messages/{message_id}",
                json={"content_text": "Too late!"},
            )

        assert response.status_code == 409


# ── DELETE /messages/{message_id} ─────────────────────────────────────────────


class TestDeleteMessage:
    def test_delete_message_returns_200(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()
        msg = _make_group_message_orm(id=message_id, is_deleted=True)
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = msg

        with (
            patch(
                "app.api.v1.endpoints.messages.delete_message",
                new=AsyncMock(return_value=msg),
            ),
            patch.object(FAKE_DB, "execute", new=AsyncMock(return_value=mock_result)),
        ):
            response = client.delete(f"/api/v1/messages/{message_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["is_deleted"] is True

    def test_delete_not_found_returns_404(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()

        with patch(
            "app.api.v1.endpoints.messages.delete_message",
            new=AsyncMock(side_effect=ChatError("Mensagem não encontrada.", status_code=404)),
        ):
            response = client.delete(f"/api/v1/messages/{message_id}")

        assert response.status_code == 404


# ── POST /messages/{message_id}/reactions ─────────────────────────────────────


class TestToggleReaction:
    def test_toggle_reaction_returns_200(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()
        msg = _make_group_message_orm(id=message_id)
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = msg

        with (
            patch(
                "app.api.v1.endpoints.messages.toggle_reaction",
                new=AsyncMock(return_value=(True, FAKE_GROUP_ID)),
            ),
            patch.object(FAKE_DB, "execute", new=AsyncMock(return_value=mock_result)),
        ):
            response = client.post(
                f"/api/v1/messages/{message_id}/reactions",
                json={"emoji": "👍"},
            )

        assert response.status_code == 200

    def test_toggle_reaction_invalid_emoji_returns_422(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()

        response = client.post(
            f"/api/v1/messages/{message_id}/reactions",
            json={"emoji": ""},
        )

        assert response.status_code == 422


# ── GET /messages/{message_id}/reactions ──────────────────────────────────────


class TestListReactions:
    def test_list_reactions_returns_200(self) -> None:
        app = _make_app()
        client = TestClient(app)
        message_id = uuid.uuid4()

        user = MagicMock()
        user.username = "alice"
        user.display_name = "Alice"

        reaction = MagicMock()
        reaction.id = uuid.uuid4()
        reaction.emoji = "❤️"
        reaction.user_id = uuid.uuid4()
        reaction.user = user
        reaction.created_at = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)

        with patch(
            "app.api.v1.endpoints.messages.list_reactions",
            new=AsyncMock(return_value=[reaction]),
        ):
            response = client.get(f"/api/v1/messages/{message_id}/reactions")

        assert response.status_code == 200
        data = response.json()
        assert len(data["reactions"]) == 1
        assert data["reactions"][0]["emoji"] == "❤️"
        assert data["reactions"][0]["username"] == "alice"
