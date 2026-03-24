"""Pydantic schemas for group chat endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MessageCreateRequest(BaseModel):
    content_type: Literal["text", "image", "gif", "video_link", "quote", "chapter_marker", "page_marker", "system"]
    content_text: str | None = Field(default=None, max_length=4000)
    content_rich_json: dict | None = None
    media_url: str | None = None
    thumbnail_url: str | None = None
    reference_type: Literal["chapter", "page", "quote"] | None = None
    reference_value: str | None = None
    is_spoiler: bool = False
    spoiler_chapter: int | None = None
    parent_message_id: str | None = None
    round_id: str | None = None

    @model_validator(mode="after")
    def validate_content_coherence(self) -> MessageCreateRequest:
        ct = self.content_type
        if ct == "text" and not self.content_text and not self.content_rich_json:
            raise ValueError("Mensagens de texto precisam de content_text ou content_rich_json.")
        if ct in ("image", "gif", "video_link") and not self.media_url:
            raise ValueError(f"Mensagens do tipo '{ct}' precisam de media_url.")
        return self


class MessageEditRequest(BaseModel):
    content_text: str | None = Field(default=None, max_length=4000)
    content_rich_json: dict | None = None


class ReactionRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class MessageAuthor(BaseModel):
    user_id: str
    username: str
    display_name: str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    did_i_react: bool


class ChatMessageResponse(BaseModel):
    id: str
    group_id: str
    round_id: str | None
    author: MessageAuthor
    content_type: str
    content_text: str | None
    content_rich_json: dict | None
    media_url: str | None
    thumbnail_url: str | None
    reference_type: str | None
    reference_value: str | None
    is_spoiler: bool
    spoiler_chapter: int | None
    parent_message_id: str | None
    reply_count: int
    reactions: list[ReactionSummary]
    created_at: datetime
    updated_at: datetime | None
    is_deleted: bool


class MessageListResponse(BaseModel):
    messages: list[ChatMessageResponse]
    next_cursor: str | None


class ReactionDetail(BaseModel):
    id: str
    emoji: str
    user_id: str
    username: str
    display_name: str | None
    created_at: datetime


class ReactionListResponse(BaseModel):
    reactions: list[ReactionDetail]
