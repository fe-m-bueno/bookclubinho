import re

from app.core.security import (
    _GROUP_CODE_ALPHABET,
    generate_group_code,
    generate_magic_token,
)

AMBIGUOUS_CHARS = set("0O1IL")


class TestGenerateGroupCode:
    def test_length(self):
        assert len(generate_group_code()) == 8

    def test_only_allowed_chars(self):
        code = generate_group_code()
        assert all(c in _GROUP_CODE_ALPHABET for c in code)

    def test_no_ambiguous_chars(self):
        for _ in range(200):
            code = generate_group_code()
            assert not AMBIGUOUS_CHARS.intersection(code), f"Ambiguous char in: {code}"

    def test_uniqueness(self):
        codes = {generate_group_code() for _ in range(500)}
        # Probability of collision in 500 draws from 31^8 ≈ 8.5e11 space is negligible
        assert len(codes) == 500


class TestGenerateMagicToken:
    def test_length(self):
        # secrets.token_urlsafe(32) → 43 URL-safe base64 chars
        token = generate_magic_token()
        assert len(token) == 43

    def test_url_safe_chars(self):
        token = generate_magic_token()
        assert re.fullmatch(r"[A-Za-z0-9_\-]+", token), f"Non URL-safe char in: {token}"

    def test_uniqueness(self):
        tokens = {generate_magic_token() for _ in range(200)}
        assert len(tokens) == 200
