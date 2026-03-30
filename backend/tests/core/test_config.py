from __future__ import annotations

from app.core.config import Settings
from app.core.database_url import normalize_database_url
from app.core.version import resolve_app_version


class TestSettings:
    def test_google_redirect_uri_uses_public_app_url(self, monkeypatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/bookclub")
        monkeypatch.setenv("REDIS_URL", "redis://localhost:6379")
        monkeypatch.setenv("JWT_SECRET", "test-secret")
        monkeypatch.setenv("APP_URL", "https://bookclubinho.vercel.app")

        settings = Settings()

        assert settings.GOOGLE_REDIRECT_URI == "https://bookclubinho.vercel.app/api/v1/auth/google/callback"


class TestResolveVersion:
    def test_prefers_render_git_commit(self, monkeypatch) -> None:
        monkeypatch.setenv("RENDER_GIT_COMMIT", "render-sha")
        monkeypatch.setenv("APP_VERSION", "app-version")
        monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "railway-sha")

        assert resolve_app_version() == "render-sha"

    def test_falls_back_to_app_version(self, monkeypatch) -> None:
        monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
        monkeypatch.setenv("APP_VERSION", "app-version")
        monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "railway-sha")

        assert resolve_app_version() == "app-version"

    def test_falls_back_to_legacy_railway_sha(self, monkeypatch) -> None:
        monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
        monkeypatch.delenv("APP_VERSION", raising=False)
        monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "railway-sha")

        assert resolve_app_version() == "railway-sha"


class TestDatabaseUrlNormalization:
    def test_converts_plain_postgres_scheme_to_asyncpg(self) -> None:
        url = "postgresql://user:pass@localhost:5432/bookclub"

        assert normalize_database_url(url) == "postgresql+asyncpg://user:pass@localhost:5432/bookclub"

    def test_sanitizes_neon_url_for_asyncpg(self) -> None:
        url = "postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

        assert normalize_database_url(url) == (
            "postgresql+asyncpg://user:pass@ep-example.us-east-1.aws.neon.tech/neondb?ssl=require"
        )
