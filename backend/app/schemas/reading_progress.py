"""Pydantic schemas for reading progress endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class ProgressUpdateRequest(BaseModel):
    current_page: int | None = Field(default=None, ge=0)
    percentage: float | None = Field(default=None, ge=0.0, le=100.0)

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
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberProgressSummary(BaseModel):
    user_id: str
    current_page: int | None
    percentage: float
    is_finished: bool
    updated_at: datetime | None  # null if no progress logged yet


class GroupProgressResponse(BaseModel):
    progress: list[MemberProgressSummary]
