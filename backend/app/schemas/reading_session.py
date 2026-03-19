"""Pydantic schemas for reading session endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    round_id: str


class SessionStopRequest(BaseModel):
    duration_override_minutes: int | None = Field(default=None, ge=0)


class SessionResponse(BaseModel):
    id: str
    user_id: str
    round_id: str
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total_duration_minutes: int
    next_cursor: str | None
