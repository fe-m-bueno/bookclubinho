"""Port for work that must run *after* the request's transaction commits.

Some effects can't run inside the transaction that triggers them.
`check_and_award_badges` is the motivating case: it opens its own
`AsyncSessionLocal` with its own RLS context, so it cannot see rows the current
transaction hasn't committed yet. Scheduling it is therefore part of a service's
contract, not a detail the endpoint remembers on its own — before this port
existed, `review.submit_review` wrote a finished ReadingProgress row and no
badge was ever re-checked for it.

Two adapters justify the seam: `BackgroundTasksScheduler` in production, and a
recording double in the tests, which is what finally lets a test assert *which*
effects a service scheduled.

Ordering note: FastAPI runs background tasks after dependency teardown, so the
`get_session` commit has already happened by the time a scheduled task runs. If
the transaction rolls back instead, the task still runs — it just finds no new
rows and does nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi import BackgroundTasks


class AfterCommit(Protocol):
    """Schedules a coroutine to run once the current transaction is committed."""

    def schedule(self, fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> None: ...


class BackgroundTasksScheduler:
    """Production adapter — delegates to FastAPI's BackgroundTasks."""

    __slots__ = ("_background_tasks",)

    def __init__(self, background_tasks: BackgroundTasks) -> None:
        self._background_tasks = background_tasks

    def schedule(self, fn: Callable[..., Any], /, *args: Any, **kwargs: Any) -> None:
        self._background_tasks.add_task(fn, *args, **kwargs)
