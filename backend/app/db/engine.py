from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings
from app.core.database_url import normalize_database_url


def _build_url() -> str:
    return normalize_database_url(str(settings.DATABASE_URL))


engine = create_async_engine(
    _build_url(),
    echo=settings.DEBUG,
    pool_pre_ping=True,  # reconnect after idle connection drop
    pool_size=5,
    max_overflow=10,
    pool_recycle=3600,  # recycle connections after 1h to avoid stale connections
    connect_args={
        "server_settings": {
            # Kill queries that run longer than 30s to prevent resource exhaustion
            "statement_timeout": "30000",
        }
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass
