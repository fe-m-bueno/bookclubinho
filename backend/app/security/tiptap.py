"""Sanitizador de JSON Tiptap — valida estrutura e sanitiza conteúdo de texto."""

from __future__ import annotations

from typing import Any

from app.security.sanitizer import sanitize_rich

# Tipos de nó permitidos no JSON Tiptap
_ALLOWED_NODE_TYPES: frozenset[str] = frozenset(
    {
        "doc",
        "paragraph",
        "text",
        "hardBreak",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "codeBlock",
        "horizontalRule",
    }
)

# Tipos de marca permitidos
_ALLOWED_MARK_TYPES: frozenset[str] = frozenset(
    {
        "bold",
        "italic",
        "strike",
        "underline",
        "code",
        "link",
    }
)


def _sanitize_marks(marks: Any) -> list[dict]:
    """Filtra marks para apenas tipos permitidos, sanitizando atributos de link."""
    if not isinstance(marks, list):
        return []
    result = []
    for mark in marks:
        if not isinstance(mark, dict):
            continue
        mark_type = mark.get("type")
        if mark_type not in _ALLOWED_MARK_TYPES:
            continue
        # Para links: sanitizar href e forçar target/rel seguros
        if mark_type == "link":
            attrs = mark.get("attrs", {}) or {}
            href = str(attrs.get("href", ""))
            # Bloquear javascript: e data: URIs
            if href.lower().lstrip().startswith(("javascript:", "data:", "vbscript:")):
                continue
            safe_attrs = {
                "href": href,
                "target": "_blank",
                "rel": "noopener noreferrer",
            }
            result.append({"type": "link", "attrs": safe_attrs})
        else:
            result.append({"type": mark_type})
    return result


def sanitize_tiptap_json(data: Any) -> Any:
    """Sanitiza um documento Tiptap JSON recursivamente.

    - Strip de node types fora da allowlist
    - Strip de mark types fora da allowlist
    - Sanitização do conteúdo textual via bleach
    - Bloqueio de javascript: e data: URIs em links
    """
    if isinstance(data, dict):
        node_type = data.get("type")

        # Nó sem type é estrutura interna válida (ex: attrs) — passa sem filtro
        if node_type is None:
            return {k: sanitize_tiptap_json(v) for k, v in data.items()}

        # Strip de nós não permitidos
        if node_type not in _ALLOWED_NODE_TYPES:
            return None

        # Sanitizar texto
        if node_type == "text":
            text = data.get("text", "")
            clean_text = sanitize_rich(str(text)) if isinstance(text, str) else ""
            result: dict[str, Any] = {"type": "text", "text": clean_text}
            if "marks" in data:
                safe_marks = _sanitize_marks(data["marks"])
                if safe_marks:
                    result["marks"] = safe_marks
            return result

        # Nós estruturais — processar atributos e conteúdo recursivamente
        sanitized: dict[str, Any] = {"type": node_type}
        if "attrs" in data and isinstance(data["attrs"], dict):
            sanitized["attrs"] = data["attrs"]
        if "content" in data:
            children = [sanitize_tiptap_json(child) for child in (data["content"] or [])]
            sanitized["content"] = [c for c in children if c is not None]
        if "marks" in data:
            safe_marks = _sanitize_marks(data["marks"])
            if safe_marks:
                sanitized["marks"] = safe_marks
        return sanitized

    if isinstance(data, list):
        return [item for item in (sanitize_tiptap_json(x) for x in data) if item is not None]

    return data
