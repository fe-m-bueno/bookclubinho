import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CreateTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    # None = não expira. O teto de 365 evita "expira em 2099", que é o mesmo que
    # nunca, mas escrito de um jeito que parece cuidadoso.
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class TokenResponse(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatedTokenResponse(TokenResponse):
    """Igual ao `TokenResponse`, mais o segredo — que só existe nesta resposta."""

    token: str


class TokenListResponse(BaseModel):
    tokens: list[TokenResponse]


class RevokeTokenResponse(BaseModel):
    message: str
