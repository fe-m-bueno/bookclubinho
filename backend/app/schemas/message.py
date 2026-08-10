"""Pydantic schemas for group chat endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class MessageCreateRequest(BaseModel):
    content_type: Literal["text", "image", "gif", "video_link", "quote", "chapter_marker", "page_marker", "system"]
    content_text: str | None = Field(default=None, max_length=4000)
    content_rich_json: dict[str, Any] | None = None
    # Mídia enviada pelo chat: o cliente devolve a *chave* do upload, nunca a URL.
    # O backend valida a chave contra o grupo e resolve a URL na serialização.
    media_key: str | None = Field(default=None, max_length=512)
    thumbnail_key: str | None = Field(default=None, max_length=512)
    # Só para video_link — link externo (YouTube etc.), não vem do nosso bucket.
    media_url: str | None = Field(default=None, max_length=2048)
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

        if ct in ("image", "gif"):
            if not self.media_key:
                raise ValueError(f"Mensagens do tipo '{ct}' precisam de media_key.")
            if self.media_url:
                raise ValueError("media_url não é aceito para imagens — envie media_key.")
        else:
            if self.media_key or self.thumbnail_key:
                raise ValueError(f"Mensagens do tipo '{ct}' não aceitam media_key.")
            if ct == "video_link":
                if not self.media_url:
                    raise ValueError("Mensagens do tipo 'video_link' precisam de media_url.")
                if not self.media_url.startswith(("http://", "https://")):
                    raise ValueError("media_url precisa ser um link http(s).")
            elif self.media_url:
                raise ValueError(f"Mensagens do tipo '{ct}' não aceitam media_url.")
        return self


class MessageEditRequest(BaseModel):
    content_text: str | None = Field(default=None, max_length=4000)
    content_rich_json: dict[str, Any] | None = None


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
    content_rich_json: dict[str, Any] | None
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
