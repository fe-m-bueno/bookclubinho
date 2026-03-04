import bleach

ALLOWED_TAGS: list[str] = []
ALLOWED_ATTRIBUTES: dict[str, list[str]] = {}


def sanitize(value: str, strip: bool = True) -> str:
    """Strip all HTML tags and clean user input."""
    return bleach.clean(value, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=strip)


def sanitize_rich(value: str) -> str:
    """Allow a limited safe subset of HTML tags for rich text fields."""
    safe_tags = ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li", "blockquote"]
    safe_attrs: dict[str, list[str]] = {}
    return bleach.clean(value, tags=safe_tags, attributes=safe_attrs, strip=True)
