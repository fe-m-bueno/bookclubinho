"""Contrato do middleware que commita antes da resposta sair.

Este é o teste que faltava. Antes, o commit vivia no código pós-`yield` de
`get_session`, que o FastAPI executa depois de enviar a resposta. Nenhum teste
com `db` mockado podia pegar a consequência: as BackgroundTasks agendadas pelo
handler rodavam antes do commit, o badge checker abria a sessão própria dele, não
encontrava as linhas novas e não concedia nada — em silêncio.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.route import CommitBeforeResponseMiddleware


def _scope(session: object | None = None, kind: str = "http") -> dict:
    state: dict[str, object] = {}
    if session is not None:
        state["db_session"] = session
    return {"type": kind, "state": state}


def _session(*, in_transaction: bool = True) -> MagicMock:
    s = MagicMock()
    s.in_transaction.return_value = in_transaction
    s.commit = AsyncMock()
    return s


class TestCommitOrdering:
    @pytest.mark.asyncio
    async def test_commits_before_response_start_is_forwarded(self) -> None:
        """A ordem é o ponto todo: commit primeiro, header depois."""
        session = _session()
        order: list[str] = []
        session.commit = AsyncMock(side_effect=lambda: order.append("commit"))

        async def app(scope: dict, receive: object, send: object) -> None:
            await send({"type": "http.response.start", "status": 200})
            await send({"type": "http.response.body", "body": b"{}"})

        async def send(message: dict) -> None:
            order.append(message["type"])

        await CommitBeforeResponseMiddleware(app)(_scope(session), AsyncMock(), send)

        assert order == ["commit", "http.response.start", "http.response.body"]

    @pytest.mark.asyncio
    async def test_commits_only_once_for_streaming_responses(self) -> None:
        """O SSE emite muitos body frames; o commit acontece uma vez."""
        session = _session()

        async def app(scope: dict, receive: object, send: object) -> None:
            await send({"type": "http.response.start", "status": 200})
            for _ in range(5):
                await send({"type": "http.response.body", "body": b"data: x\n\n"})

        await CommitBeforeResponseMiddleware(app)(_scope(session), AsyncMock(), AsyncMock())

        session.commit.assert_awaited_once()


class TestWhenItDoesNothing:
    @pytest.mark.asyncio
    async def test_no_session_on_scope_is_fine(self) -> None:
        """Rotas que não dependem de DBSession não publicam sessão nenhuma."""
        sent: list[dict] = []

        async def app(scope: dict, receive: object, send: object) -> None:
            await send({"type": "http.response.start", "status": 200})

        async def send(message: dict) -> None:
            sent.append(message)

        await CommitBeforeResponseMiddleware(app)(_scope(None), AsyncMock(), send)

        assert sent == [{"type": "http.response.start", "status": 200}]

    @pytest.mark.asyncio
    async def test_session_without_open_transaction_is_not_committed(self) -> None:
        session = _session(in_transaction=False)

        async def app(scope: dict, receive: object, send: object) -> None:
            await send({"type": "http.response.start", "status": 200})

        await CommitBeforeResponseMiddleware(app)(_scope(session), AsyncMock(), AsyncMock())

        session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_non_http_scope_passes_through(self) -> None:
        session = _session()
        called = False

        async def app(scope: dict, receive: object, send: object) -> None:
            nonlocal called
            called = True

        await CommitBeforeResponseMiddleware(app)(_scope(session, kind="lifespan"), AsyncMock(), AsyncMock())

        assert called
        session.commit.assert_not_awaited()


class TestCommitFailure:
    @pytest.mark.asyncio
    async def test_commit_error_propagates_instead_of_answering_200(self) -> None:
        """Se o commit falha, a escrita não aconteceu — responder 200 seria mentira."""
        session = _session()
        session.commit = AsyncMock(side_effect=RuntimeError("commit falhou"))
        sent: list[dict] = []

        async def app(scope: dict, receive: object, send: object) -> None:
            await send({"type": "http.response.start", "status": 200})

        async def send(message: dict) -> None:
            sent.append(message)

        with pytest.raises(RuntimeError, match="commit falhou"):
            await CommitBeforeResponseMiddleware(app)(_scope(session), AsyncMock(), send)

        assert sent == [], "o header não deve sair se o commit falhou"
