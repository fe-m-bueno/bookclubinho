from pydantic import BaseModel


class HardcoverConnectRequest(BaseModel):
    token: str


class HardcoverStatusResponse(BaseModel):
    connected: bool
    hardcover_username: str | None = None


class IntegrationToggleRequest(BaseModel):
    auto_sync_hardcover: bool
