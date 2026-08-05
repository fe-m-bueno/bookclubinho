"""Middleware that commits the request's transaction before the response starts.

`get_session` used to be the only thing that committed, in the code after its
`yield`. FastAPI runs that teardown *after* the response has been sent, which had
two consequences:

  * A client reading immediately after writing could see the old value — measured
    at 1 in 20 with no network latency in between.
  * Worse: `BackgroundTasks` scheduled by the handler ran before the commit. The
    badge checker opens its own session with its own RLS context, so it found no
    new rows and awarded nothing, silently — the per-badge savepoints swallow the
    miss. Only `founder` worked, because `groups.py` had learned to commit by hand.

This is a raw ASGI middleware rather than a `route_class`, because
`include_router` preserves each child router's own route class and the app mounts
~25 of them; and rather than a `BaseHTTPMiddleware`, so the SSE endpoint keeps
streaming normally. Hooking `send` lets the commit land before the response
headers go out, which is precisely the ordering that was missing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = structlog.get_logger(__name__)


class CommitBeforeResponseMiddleware:
    """Commits `request.state.db_session` before `http.response.start` is sent."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        committed = False

        async def send_wrapper(message: Message) -> None:
            nonlocal committed
            if message["type"] == "http.response.start" and not committed:
                committed = True
                session = scope.get("state", {}).get("db_session")
                if session is not None and session.in_transaction():
                    # Deliberately not swallowing: if the commit fails the write
                    # didn't happen, and answering 200 would be a lie.
                    await session.commit()
            await send(message)

        await self.app(scope, receive, send_wrapper)
