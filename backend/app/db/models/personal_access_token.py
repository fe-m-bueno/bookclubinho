"""PersonalAccessToken model — credencial de longa duração para CLI e agentes.

O par cookie httpOnly + CSRF existe porque o browser anexa cookie sozinho. Um
cliente que não é browser não tem esse problema e não deveria pagar esse preço:
para ele, um token opaco no header `Authorization` basta, e é revogável sem
derrubar as sessões de browser do mesmo usuário.

Só o hash do token mora aqui — ver `hash_personal_access_token`.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.engine import Base
from app.db.models.base import CreatedAtMixin


class PersonalAccessToken(CreatedAtMixin, Base):
    __tablename__ = "personal_access_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False, index=True)
    # Em claro, e só os primeiros caracteres: é o que o usuário vê na lista para
    # saber qual token revogar. Não autentica nada sozinho.
    prefix: Mapped[str] = mapped_column(Text, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # NULL = não expira. Um agente que roda sozinho é justamente o caso em que
    # expiração silenciosa quebra a automação no pior momento, então é opt-in.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
