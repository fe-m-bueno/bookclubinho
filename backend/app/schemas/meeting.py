"""Pydantic schemas for meeting endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MeetingCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)
    meeting_type: Literal["in_person", "virtual", "hybrid"]
    virtual_link: str | None = Field(default=None, max_length=2000)
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    round_id: str | None = None

    @model_validator(mode="after")
    def validate_meeting_fields(self) -> MeetingCreateRequest:
        if self.meeting_type in ("virtual", "hybrid") and not self.virtual_link:
            raise ValueError(
                "Encontros virtuais ou híbridos precisam de um link."
            )
        if self.meeting_type in ("in_person", "hybrid") and not self.location:
            raise ValueError(
                "Encontros presenciais ou híbridos precisam de um local."
            )
        return self


class MeetingUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)
    meeting_type: Literal["in_person", "virtual", "hybrid"] | None = None
    virtual_link: str | None = Field(default=None, max_length=2000)
    scheduled_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=15, le=480)
    round_id: str | None = None


class RsvpRequest(BaseModel):
    status: Literal["going", "maybe", "not_going"]


class RsvpSummary(BaseModel):
    user_id: str
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    responded_at: datetime | None


class MeetingResponse(BaseModel):
    id: str
    group_id: str
    round_id: str | None
    title: str
    description: str | None
    location: str | None
    meeting_type: str
    virtual_link: str | None
    scheduled_at: datetime
    duration_minutes: int
    created_by: str
    creator_username: str
    rsvps: list[RsvpSummary]
    rsvp_counts: dict[str, int]
    created_at: datetime
    updated_at: datetime


class MeetingListItem(BaseModel):
    id: str
    group_id: str
    round_id: str | None
    title: str
    description: str | None
    location: str | None
    meeting_type: str
    virtual_link: str | None
    scheduled_at: datetime
    duration_minutes: int
    created_by: str
    creator_username: str
    rsvp_counts: dict[str, int]
    my_rsvp_status: str | None
    created_at: datetime
    updated_at: datetime


class MeetingListResponse(BaseModel):
    meetings: list[MeetingListItem]
    next_cursor: str | None


class UpcomingMeetingItem(BaseModel):
    id: str
    title: str
    scheduled_at: datetime
    duration_minutes: int
    meeting_type: str
    group_id: str
    group_name: str
    group_photo_url: str | None = None
    my_rsvp_status: str | None = None


class UpcomingMeetingsResponse(BaseModel):
    meetings: list[UpcomingMeetingItem]
