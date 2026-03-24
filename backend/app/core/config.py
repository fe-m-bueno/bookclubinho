from typing import Literal

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    ENVIRONMENT: Literal["dev", "staging", "prod"] = "dev"
    APP_URL: str = "http://localhost:3000"  # Vercel frontend — used in emails + CORS
    # Comma-separated string — pydantic-settings v2 JSON-parses list[str] fields
    # from env vars before validators run, so we keep it as str and split on demand.
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def DEBUG(self) -> bool:  # noqa: N802
        return self.ENVIRONMENT == "dev"

    # ── Database (Railway Postgres internal URL) ──────────────────────────────
    DATABASE_URL: PostgresDsn
    # asyncpg driver — Alembic and SQLAlchemy both use this
    # Format: postgresql+asyncpg://user:pass@host:port/db

    # ── Redis / Upstash ───────────────────────────────────────────────────────
    # TCP URL — used for SSE (XREAD/BLOCK) and pub/sub
    REDIS_URL: str  # redis[s]://:<token>@host:port
    # HTTP REST API — used for simple cache ops (no persistent connection needed)
    UPSTASH_REDIS_REST_URL: str = ""
    UPSTASH_REDIS_REST_TOKEN: str = ""

    # ── Storage (Cloudflare R2 — S3-compatible) ───────────────────────────────
    S3_ENDPOINT: str = ""           # https://<account>.r2.cloudflarestorage.com
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET_NAME: str = "bookclub-public"
    S3_PUBLIC_URL: str = ""         # https://pub.youromain.com  (R2 custom domain)

    # ── JWT / Auth ────────────────────────────────────────────────────────────
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── OAuth — Google ────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    BACKEND_URL: str = "http://localhost:8000"

    @property
    def GOOGLE_REDIRECT_URI(self) -> str:  # noqa: N802
        return f"{self.BACKEND_URL.rstrip('/')}/api/v1/auth/google/callback"

    # ── Email — Resend ────────────────────────────────────────────────────────
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@bookclub.app"

    # ── External APIs ─────────────────────────────────────────────────────────
    HARDCOVER_API_URL: str = "https://api.hardcover.app/v1/graphql"
    HARDCOVER_API_TOKEN: str = ""

    # ── Observability ─────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""

    # ── Derived helpers ───────────────────────────────────────────────────────
    @property
    def database_url_sync(self) -> str:
        """Sync URL for Alembic offline migrations (psycopg2 driver)."""
        return str(self.DATABASE_URL).replace("+asyncpg", "")


settings = Settings()  # type: ignore[call-arg]
