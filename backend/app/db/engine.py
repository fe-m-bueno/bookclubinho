from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.core.config import settings
from app.core.database_url import normalize_database_url
from app.core.rls import reapply_context_on_new_transaction


def _build_url() -> str:
    """A URL privilegiada — cria tabela e política.

    `alembic/env.py` importa esta, e é de propósito: migration precisa do papel
    que possui as tabelas e pode escrever política. Não troque por
    :func:`_build_app_url` — o app não deve ter esse poder, e o papel restrito
    não conseguiria migrar.
    """
    return normalize_database_url(str(settings.DATABASE_URL))


def _build_app_url() -> str:
    """A URL que o app usa: o papel restrito quando houver.

    Sem `DATABASE_APP_URL` cai na privilegiada, que é o estado de hoje — e nesse
    estado as políticas não valem, porque o papel ignora RLS.
    """
    restrita = settings.DATABASE_APP_URL
    return normalize_database_url(str(restrita if restrita is not None else settings.DATABASE_URL))


engine = create_async_engine(
    _build_app_url(),
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

# O contexto RLS é `SET LOCAL` e portanto morre em cada commit — inclusive nos
# que acontecem no meio de uma requisição. Reaplicá-lo no início de toda
# transação é o que mantém as políticas valendo do começo ao fim do request.
# Ligado na `Session` síncrona porque é ela que a `AsyncSession` dirige por
# baixo — é lá que o evento `after_begin` existe. Toda sessão ORM deste processo
# nasce de `AsyncSessionLocal`; o Alembic trabalha em `Connection` crua e não
# passa por aqui.
event.listen(Session, "after_begin", reapply_context_on_new_transaction)


class Base(DeclarativeBase):
    pass
