"""Testes para o sanitizador de JSON Tiptap."""

from __future__ import annotations

import pytest

from app.security.tiptap import sanitize_tiptap_json


class TestSanitizeTiptapJson:
    def test_passthrough_valid_doc(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Hello"}],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        assert result["type"] == "doc"
        assert result["content"][0]["type"] == "paragraph"
        assert result["content"][0]["content"][0]["text"] == "Hello"

    def test_strips_script_node_type(self) -> None:
        """Nós do tipo 'script' devem ser removidos."""
        doc = {
            "type": "doc",
            "content": [
                {"type": "script", "text": "alert(1)"},
                {"type": "paragraph", "content": [{"type": "text", "text": "Safe"}]},
            ],
        }
        result = sanitize_tiptap_json(doc)
        # script node stripped, only paragraph remains
        assert len(result["content"]) == 1
        assert result["content"][0]["type"] == "paragraph"

    def test_strips_iframe_node_type(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {"type": "iframe", "attrs": {"src": "https://evil.com"}},
            ],
        }
        result = sanitize_tiptap_json(doc)
        assert len(result["content"]) == 0

    def test_sanitizes_text_content(self) -> None:
        """Conteúdo HTML em nós de texto deve ser escapado."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "<img onerror=alert(1) src=x>"},
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        text = result["content"][0]["content"][0]["text"]
        assert "<img" not in text
        assert "onerror" not in text

    def test_strips_javascript_links(self) -> None:
        """Links com href javascript: devem ser removidos."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click",
                            "marks": [
                                {"type": "link", "attrs": {"href": "javascript:alert(1)"}}
                            ],
                        }
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        text_node = result["content"][0]["content"][0]
        # Link mark deve ter sido removido
        assert "marks" not in text_node or len(text_node["marks"]) == 0

    def test_strips_data_uri_links(self) -> None:
        """Links com href data: devem ser removidos."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click",
                            "marks": [
                                {"type": "link", "attrs": {"href": "data:text/html,<h1>XSS</h1>"}}
                            ],
                        }
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        text_node = result["content"][0]["content"][0]
        assert "marks" not in text_node or len(text_node["marks"]) == 0

    def test_valid_link_preserved_with_safe_attrs(self) -> None:
        """Links HTTPS válidos devem ser preservados com target=_blank rel=noopener."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "click",
                            "marks": [
                                {"type": "link", "attrs": {"href": "https://example.com"}}
                            ],
                        }
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        link_mark = result["content"][0]["content"][0]["marks"][0]
        assert link_mark["type"] == "link"
        assert link_mark["attrs"]["href"] == "https://example.com"
        assert link_mark["attrs"]["target"] == "_blank"
        assert "noopener" in link_mark["attrs"]["rel"]

    def test_strips_unknown_mark_types(self) -> None:
        """Marks desconhecidas (ex: 'font-color') devem ser removidas."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "colored",
                            "marks": [
                                {"type": "font-color", "attrs": {"color": "red"}},
                                {"type": "bold"},
                            ],
                        }
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        marks = result["content"][0]["content"][0]["marks"]
        mark_types = [m["type"] for m in marks]
        assert "font-color" not in mark_types
        assert "bold" in mark_types

    def test_handles_none_and_empty(self) -> None:
        assert sanitize_tiptap_json(None) is None
        assert sanitize_tiptap_json([]) == []
        assert sanitize_tiptap_json({}) == {}

    def test_handles_nested_lists(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "Item 1"}],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
        result = sanitize_tiptap_json(doc)
        item_text = (
            result["content"][0]["content"][0]["content"][0]["content"][0]["text"]
        )
        assert item_text == "Item 1"
