"""Testes de endpoint para indicador de digitação.

POST /api/v1/groups/{group_id}/messages/typing
  204 — membro autenticado
  401 — sem autenticação
  404 — usuário autenticado mas não é membro do grupo
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from app.api.v1.endpoints.messages import group_messages_router
from app.core.deps import get_current_active_user, get_group_membership, get_session
from tests.conftest import make_user

# ── Shared fixtures ────────────────────────────────────────────────────────────

FAKE_GROUP_ID = uuid.uuid4()
FAKE_USER = make_user()
FAKE_DB = AsyncMock()
FAKE_MEMBER = MagicMock()
FAKE_MEMBER.user_id = FAKE_USER.id
FAKE_MEMBER.group_id = FAKE_GROUP_ID


def _make_authenticated_app() -> FastAPI:
    """App com todas as dependências sobrescritas — simula membro autenticado."""
    app = FastAPI()
    app.include_router(
        group_messages_router,
        prefix="/api/v1/groups/{group_id}/messages",
    )
    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    app.dependency_overrides[get_group_membership] = lambda: FAKE_MEMBER
    return app


def _make_unauthenticated_app() -> FastAPI:
    """App sem override de autenticação — get_current_active_user levanta 401."""
    app = FastAPI()
    app.include_router(
        group_messages_router,
        prefix="/api/v1/groups/{group_id}/messages",
    )

    async def _raise_401() -> None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não autenticado.",
        )

    app.dependency_overrides[get_current_active_user] = _raise_401
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    # get_group_membership depende de get_current_active_user, então também falha
    app.dependency_overrides[get_group_membership] = _raise_401
    return app


def _make_nonmember_app() -> FastAPI:
    """App com usuário autenticado mas sem membership no grupo — levanta 404."""
    app = FastAPI()
    app.include_router(
        group_messages_router,
        prefix="/api/v1/groups/{group_id}/messages",
    )

    async def _raise_404() -> None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clube não encontrado.",
        )

    app.dependency_overrides[get_current_active_user] = lambda: FAKE_USER
    app.dependency_overrides[get_session] = lambda: FAKE_DB
    app.dependency_overrides[get_group_membership] = _raise_404
    return app


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestTypingIndicator:
    def test_typing_returns_204_for_member(self) -> None:
        """Membro autenticado recebe 204 No Content ao postar indicador de digitação."""
        app = _make_authenticated_app()
        client = TestClient(app)

        with patch(
            "app.api.v1.endpoints.messages.emit_typing_event",
            new=AsyncMock(return_value=None),
        ):
            response = client.post(f"/api/v1/groups/{FAKE_GROUP_ID}/messages/typing")

        assert response.status_code == 204
        assert response.content == b""

    def test_typing_returns_401_without_auth(self) -> None:
        """Requisição sem autenticação recebe 401 Unauthorized."""
        app = _make_unauthenticated_app()
        client = TestClient(app)

        response = client.post(f"/api/v1/groups/{FAKE_GROUP_ID}/messages/typing")

        assert response.status_code == 401

    def test_typing_returns_404_for_nonmember(self) -> None:
        """Usuário autenticado mas que não é membro do grupo recebe 404."""
        app = _make_nonmember_app()
        client = TestClient(app)

        response = client.post(f"/api/v1/groups/{FAKE_GROUP_ID}/messages/typing")

        assert response.status_code == 404
