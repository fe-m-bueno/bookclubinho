import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from tenacity import (
    RetryError,
    before_sleep_log,
    retry,
    stop_after_attempt,
    wait_exponential,
)

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.redis import close_redis_pool
from app.core.rls import RLSMiddleware
from app.db.engine import engine
from app.security.body_limit import BodySizeLimitMiddleware
from app.security.csrf import CSRFMiddleware
from app.security.headers import SecurityHeadersMiddleware
from app.security.rate_limit import limiter
from app.services.hardcover import close_hardcover_client

configure_logging(debug=settings.DEBUG)
logger = structlog.get_logger(__name__)

_TOKEN_RE = re.compile(r"[?&](token|code|access_token)=[^&\s]+")


def _sentry_before_send(event: dict, hint: dict) -> dict | None:
    """Strip PII from Sentry events before sending."""
    request = event.get("request", {})

    if "/auth/" in request.get("url", ""):
        request["data"] = "[FILTERED]"

    if "url" in request:
        request["url"] = _TOKEN_RE.sub(r"?\1=[FILTERED]", request["url"])

    if "cookies" in request:
        request["cookies"] = {k: "[FILTERED]" for k in request["cookies"]}

    headers = request.get("headers", {})
    if "Authorization" in headers:
        headers["Authorization"] = "[FILTERED]"

    user_ctx = event.get("user", {})
    if "email" in user_ctx:
        user_ctx["email"] = "[FILTERED]"

    return event


if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=_sentry_before_send,
    )
    logger.info("sentry_initialized", environment=settings.ENVIRONMENT)


# ── DB startup probe with exponential backoff ─────────────────────────────────

@retry(
    stop=stop_after_attempt(10),
    # 2^1=2s, 2^2=4s … 2^9=512s — capped at 60s per wait
    wait=wait_exponential(multiplier=1, exp_base=2, min=2, max=60),
    before_sleep=before_sleep_log(logger, "warning"),  # type: ignore[arg-type]
    reraise=True,
)
async def _wait_for_db() -> None:
    """Probe the DB with SELECT 1.  Retried up to 10 times with 2^n back-off."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


# ── Application lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("startup", environment=settings.ENVIRONMENT)

    try:
        await _wait_for_db()
        logger.info("db_ready")
    except RetryError:
        logger.error("db_unavailable_after_retries")
        raise

    yield

    await close_hardcover_client()
    await close_redis_pool()
    await engine.dispose()
    logger.info("shutdown")


# ── FastAPI application ───────────────────────────────────────────────────────

app = FastAPI(
    title="Bookclub API",
    version="0.1.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

app.state.limiter = limiter

# Middleware order: Starlette is LIFO — last added runs outermost (first).
# Execution order: SecurityHeaders → CORS → CSRF → RLS → route handler
app.add_middleware(RLSMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(BodySizeLimitMiddleware)


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Muitas requisições. Tente novamente em breve."},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_exception", path=request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Erro interno do servidor."},
    )


# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(api_router)
