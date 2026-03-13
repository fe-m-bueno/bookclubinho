"""
GET /api/v1/health

Checks database, Redis, and S3 connectivity.
Returns 200 when all checks pass, 503 when any check fails.
Used as the Railway health check endpoint.
"""

from __future__ import annotations

import asyncio
import os
from typing import Literal

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db.engine import engine

router = APIRouter(tags=["health"])
logger = structlog.get_logger(__name__)

CheckStatus = Literal["ok", "error"]

# Git SHA injected by Railway at build time; falls back to "unknown"
_VERSION: str = os.getenv("RAILWAY_GIT_COMMIT_SHA", os.getenv("APP_VERSION", "unknown"))


# ── Individual checks ─────────────────────────────────────────────────────────

async def _check_db() -> tuple[CheckStatus, str | None]:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "ok", None
    except Exception as exc:
        logger.warning("health_check_db_failed", error=str(exc))
        return "error", str(exc)


async def _check_redis() -> tuple[CheckStatus, str | None]:
    client: aioredis.Redis | None = None
    try:
        client = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        await client.ping()
        return "ok", None
    except Exception as exc:
        logger.warning("health_check_redis_failed", error=str(exc))
        return "error", str(exc)
    finally:
        if client is not None:
            await client.aclose()


async def _check_s3() -> tuple[CheckStatus, str | None]:
    # S3/boto3 is sync — run in a thread to avoid blocking the event loop
    try:
        import boto3
        from botocore.config import Config

        def _head() -> None:
            client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                region_name="auto",
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                    connect_timeout=3,
                    read_timeout=3,
                    retries={"max_attempts": 1},
                ),
            )
            client.head_bucket(Bucket=settings.S3_BUCKET_NAME)

        await asyncio.to_thread(_head)
        return "ok", None
    except Exception as exc:
        logger.warning("health_check_s3_failed", error=str(exc))
        return "error", str(exc)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get(
    "/health",
    summary="Health check",
    response_description="Service health status",
)
async def health(detailed: bool = False) -> JSONResponse:
    """
    Run all dependency checks concurrently and return a summary.

    - **200** — all checks passed (`status: healthy`)
    - **503** — one or more checks failed (`status: degraded`)

    Pass `?detailed=true` to include error messages in the response
    (disabled by default to avoid leaking internals in production).
    """
    db_status, db_err = await _check_db()
    redis_status, redis_err = await _check_redis()
    s3_status, s3_err = await _check_s3()

    all_ok = db_status == "ok" and redis_status == "ok" and s3_status == "ok"
    overall: Literal["healthy", "degraded"] = "healthy" if all_ok else "degraded"

    checks: dict[str, str] = {
        "db": db_status,
        "redis": redis_status,
        "s3": s3_status,
    }

    if detailed and not all_ok:
        if db_err:
            checks["db_error"] = db_err
        if redis_err:
            checks["redis_error"] = redis_err
        if s3_err:
            checks["s3_error"] = s3_err

    body = {
        "status": overall,
        "checks": checks,
        "version": _VERSION,
    }

    http_status = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(content=body, status_code=http_status)
