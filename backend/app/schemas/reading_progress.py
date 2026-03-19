"""Pydantic schemas for reading progress endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ProgressUpdateRequest(BaseModel):
    current_page: int | None = Field(default=None, ge=0)
    percentage: float | None = Field(default=None, ge=0.0, le=100.0)
    progress_type: Literal["page", "chapter", "percentage", "finished"] | None = None
    total_pages: int | None = Field(default=None, ge=1)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "ProgressUpdateRequest":
        if self.current_page is None and self.percentage is None:
            raise ValueError("Informe a página ou a porcentagem.")
        return self


class ProgressResponse(BaseModel):
    id: str
    user_id: str
    current_page: int | None
    percentage: float
    is_finished: bool  # derived: percentage >= 100.0
    progress_type: str
    total_pages: int | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberProgressSummary(BaseModel):
    user_id: str
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    streak_current: int = 0
    current_page: int | None
    total_pages: int | None = None
    percentage: float
    is_finished: bool
    note: str | None = None
    updated_at: datetime | None  # null if no progress logged yet


class GroupProgressResponse(BaseModel):
    progress: list[MemberProgressSummary]
    round_started_at: datetime | None = None
