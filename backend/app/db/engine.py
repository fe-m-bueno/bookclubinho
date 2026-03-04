from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _build_url() -> str:
    """
    Railway injects DATABASE_URL as postgresql://... (psycopg2 scheme).
    SQLAlchemy async requires postgresql+asyncpg://.
    Handle both so local .env and Railway env work without changes.
    """
    url = str(settings.DATABASE_URL)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        # Some providers use the shorter alias
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


engine = create_async_engine(
    _build_url(),
    echo=settings.DEBUG,
    pool_pre_ping=True,   # reconnect after idle connection drop
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass
