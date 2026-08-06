"""Testes da mídia do chat na serialização — a URL nasce na resposta, não no banco.

O bug (#232): a presigned URL era gravada em `group_messages.media_url` e
morria uma hora depois, levando a imagem junto. Agora o que fica guardado é a
chave; a URL é assunto da resposta.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI
from fastapi.testclient import TestClient
from freezegun import freeze_time

from app.api.v1.endpoints.messages import group_messages_router, messages_router
from app.core.deps import get_current_active_user, get_group_membership, get_session
from tests.conftest import make_user

FAKE_GROUP_ID = uuid.uuid4()
FAKE_USER = make_user()
FAKE_DB = AsyncMock()
FAKE_MEMBER = MagicMock()
FAKE_MEMBER.user_id = FAKE_USER.id
FAKE_MEMBER.group_id = FAKE_GROUP_ID

_T0 = datetime(2026, 3, 19, 10, 0, 0, tzinfo=UTC)


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(group_messages_router, prefix="/api/v1/groups/{group_id}/messages")
    app.include_router(messages_router, prefix="/api/v1/messages")
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    app.dependency_overrides[get_group_membership] = lambda: FAKE_MEMBER
    return app


def _make_image_message(**overrides: object) -> MagicMock:
    """Mock de GroupMessage do tipo imagem, guardando chave (não URL)."""
    msg = MagicMock()
    msg.id = uuid.uuid4()
    msg.group_id = FAKE_GROUP_ID
    msg.round_id = None
    msg.user_id = FAKE_USER.id
    msg.user = FAKE_USER
    msg.content_type = "image"
    msg.content_text = None
    msg.content_rich_json = None
    msg.media_key = overrides.get("media_key", f"media/{FAKE_GROUP_ID}/{uuid.uuid4()}.webp")
    msg.thumbnail_key = overrides.get("thumbnail_key", f"media/{FAKE_GROUP_ID}/{uuid.uuid4()}_thumb.webp")
    msg.media_url = overrides.get("media_url")
    msg.thumbnail_url = overrides.get("thumbnail_url")
    msg.reference_type = None
    msg.reference_value = None
    msg.is_spoiler = False
    msg.spoiler_chapter = None
    msg.parent_message_id = None
    msg.reactions = []
    msg.created_at = _T0
    msg.updated_at = None
    msg.is_deleted = False
    msg.__dict__["_reply_count"] = 0
    return msg


def _list_media_url(client: TestClient, msg: MagicMock) -> str:
    with patch(
        "app.api.v1.endpoints.messages.list_messages",
        new=AsyncMock(return_value=([msg], {}, None)),
    ):
        response = client.get(f"/api/v1/groups/{FAKE_GROUP_ID}/messages")
    assert response.status_code == 200
    return response.json()["messages"][0]["media_url"]


def _signed_at(url: str) -> datetime:
    """Momento da assinatura, lido do X-Amz-Date da presigned URL."""
    params = parse_qs(urlparse(url).query)
    return datetime.strptime(params["X-Amz-Date"][0], "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)


def test_media_url_is_still_valid_two_hours_later() -> None:
    """O teste que a arquitetura antiga não deixava escrever.

    Mensagem enviada em T0, listada em T0+2h: a URL da listagem é assinada
    naquele instante, não em T0 — a imagem não caduca junto com a assinatura.
    """
    client = TestClient(_make_app())
    msg = _make_image_message()

    with freeze_time(_T0):
        url_at_send = _list_media_url(client, msg)

    later = _T0 + timedelta(hours=2)
    with freeze_time(later):
        url_later = _list_media_url(client, msg)

    assert _signed_at(url_at_send) == _T0
    assert _signed_at(url_later) == later

    # Assinada agora, com uma hora de validade pela frente — ainda vale.
    expires = int(parse_qs(urlparse(url_later).query)["X-Amz-Expires"][0])
    assert _signed_at(url_later) + timedelta(seconds=expires) > later
    assert url_later != url_at_send


def test_stored_row_holds_a_key_not_a_signed_url() -> None:
    """Nada de assinatura no dado persistido — só a chave do objeto."""
    msg = _make_image_message()

    assert msg.media_key.startswith(f"media/{FAKE_GROUP_ID}/")
    assert "X-Amz-Signature" not in msg.media_key
    assert msg.media_url is None

    client = TestClient(_make_app())
    url = _list_media_url(client, msg)
    assert "X-Amz-Signature" in url
    assert msg.media_key in url


def test_video_link_keeps_its_external_url() -> None:
    """`video_link` não tem chave — a URL externa continua saindo como está."""
    msg = _make_image_message(media_key=None, thumbnail_key=None)
    msg.content_type = "video_link"
    msg.media_url = "https://youtube.com/watch?v=abc"

    client = TestClient(_make_app())
    assert _list_media_url(client, msg) == "https://youtube.com/watch?v=abc"


def test_deleted_message_exposes_no_media_url() -> None:
    msg = _make_image_message()
    msg.is_deleted = True

    client = TestClient(_make_app())
    assert _list_media_url(client, msg) is None
