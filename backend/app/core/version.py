from __future__ import annotations

import os


def resolve_app_version() -> str:
    """Resolve the deployed app version across hosting providers."""
    return os.getenv(
        "RENDER_GIT_COMMIT",
        os.getenv("APP_VERSION", os.getenv("RAILWAY_GIT_COMMIT_SHA", "unknown")),
    )
