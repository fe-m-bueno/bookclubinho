import asyncio
from logging.config import fileConfig
from collections.abc import Callable

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.engine import Base, _build_url

# ── Import every model module so Alembic sees all mapped tables ───────────────
import app.db.models  # noqa: F401  — re-exports User, TimestampMixin, etc.
# Add future model modules here:
# import app.db.models.group      # noqa: F401
# import app.db.models.round      # noqa: F401

# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Offline mode (generates SQL without a live DB connection) ─────────────────
def run_migrations_offline() -> None:
    """
    Emit migration SQL to stdout without connecting to the database.
    Useful for reviewing migrations or running them manually.
    """
    context.configure(
        url=_build_url(),          # always uses the asyncpg-normalised URL
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode (runs against a live DB) ─────────────────────────────────────
def _run_sync(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Create a short-lived async engine just for the migration run."""
    connectable = create_async_engine(_build_url(), echo=False, pool_pre_ping=True)
    async with connectable.connect() as connection:
        await connection.run_sync(_run_sync)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
