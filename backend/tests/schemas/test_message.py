"""Testes unitários para schemas de chat (app.schemas.message)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.message import MessageCreateRequest, ReactionRequest


class TestMessageCreateRequest:
    def test_valid_text_message(self) -> None:
        req = MessageCreateRequest(
            content_type="text",
            content_text="Olá, pessoal!",
        )
        assert req.content_type == "text"
        assert req.content_text == "Olá, pessoal!"
        assert req.is_spoiler is False

    def test_text_without_content_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            MessageCreateRequest(content_type="text")
        assert "content_text" in str(exc_info.value) or "content_rich_json" in str(exc_info.value)

    def test_text_with_rich_json_only_is_valid(self) -> None:
        req = MessageCreateRequest(
            content_type="text",
            content_rich_json={"type": "doc", "content": []},
        )
        assert req.content_rich_json is not None

    def test_image_without_media_url_raises(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            MessageCreateRequest(content_type="image")
        assert "media_url" in str(exc_info.value)

    def test_image_with_media_url_is_valid(self) -> None:
        req = MessageCreateRequest(
            content_type="image",
            media_url="https://example.com/img.jpg",
        )
        assert req.media_url == "https://example.com/img.jpg"

    def test_gif_without_media_url_raises(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreateRequest(content_type="gif")

    def test_video_link_without_media_url_raises(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreateRequest(content_type="video_link")

    def test_content_text_max_length(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreateRequest(
                content_type="text",
                content_text="x" * 4001,
            )

    def test_content_text_at_max_length(self) -> None:
        req = MessageCreateRequest(
            content_type="text",
            content_text="x" * 4000,
        )
        assert len(req.content_text) == 4000

    def test_system_message_valid_without_content(self) -> None:
        # system messages don't require content_text or media_url
        req = MessageCreateRequest(content_type="system")
        assert req.content_type == "system"

    def test_chapter_marker_valid(self) -> None:
        req = MessageCreateRequest(
            content_type="chapter_marker",
            reference_type="chapter",
            reference_value="5",
        )
        assert req.reference_type == "chapter"

    def test_invalid_content_type_raises(self) -> None:
        with pytest.raises(ValidationError):
            MessageCreateRequest(content_type="invalid_type")

    def test_spoiler_fields(self) -> None:
        req = MessageCreateRequest(
            content_type="text",
            content_text="Spoiler!",
            is_spoiler=True,
            spoiler_chapter=10,
        )
        assert req.is_spoiler is True
        assert req.spoiler_chapter == 10


class TestReactionRequest:
    def test_valid_emoji(self) -> None:
        req = ReactionRequest(emoji="👍")
        assert req.emoji == "👍"

    def test_empty_emoji_raises(self) -> None:
        with pytest.raises(ValidationError):
            ReactionRequest(emoji="")

    def test_emoji_too_long_raises(self) -> None:
        with pytest.raises(ValidationError):
            ReactionRequest(emoji="x" * 33)

    def test_emoji_at_max_length(self) -> None:
        req = ReactionRequest(emoji="x" * 32)
        assert len(req.emoji) == 32
