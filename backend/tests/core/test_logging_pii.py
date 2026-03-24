"""Testes para o filtro de PII no structlog processor chain."""

from __future__ import annotations

import pytest

from app.core.logging import _mask_email, _pii_filter_processor


class TestMaskEmail:
    def test_masks_simple_email(self) -> None:
        result = _mask_email("user@example.com")
        assert "@" not in result.split("@")[0] or result == "u***@***.com"
        assert "user" not in result

    def test_masks_email_in_text(self) -> None:
        text = "Usuário john.doe@company.org fez login."
        result = _mask_email(text)
        assert "john.doe" not in result
        assert "company.org" not in result
        assert "fez login" in result

    def test_preserves_non_email_text(self) -> None:
        text = "Usuário fez login com sucesso."
        assert _mask_email(text) == text

    def test_multiple_emails_masked(self) -> None:
        text = "De: a@b.com Para: c@d.com"
        result = _mask_email(text)
        assert "a@b.com" not in result
        assert "c@d.com" not in result


class TestPiiFilterProcessor:
    def _process(self, **kwargs) -> dict:
        event_dict = {"event": "test", **kwargs}
        return _pii_filter_processor(None, "info", event_dict)

    def test_redacts_password_key(self) -> None:
        result = self._process(password="mysecret123")
        assert result["password"] == "[REDACTED]"

    def test_redacts_token_key(self) -> None:
        result = self._process(token="eyJhbGciOiJIUzI1NiJ9.abc.xyz")
        assert result["token"] == "[REDACTED]"

    def test_redacts_access_token(self) -> None:
        result = self._process(access_token="some-jwt-token")
        assert result["access_token"] == "[REDACTED]"

    def test_redacts_api_key(self) -> None:
        result = self._process(api_key="re_abc123xyz")
        assert result["api_key"] == "[REDACTED]"

    def test_masks_email_in_string_value(self) -> None:
        result = self._process(message="Login de user@example.com falhou")
        assert "user@example.com" not in result["message"]

    def test_preserves_non_pii_fields(self) -> None:
        result = self._process(user_id="abc-123", status_code=401)
        assert result["user_id"] == "abc-123"
        assert result["status_code"] == 401

    def test_event_field_preserved(self) -> None:
        result = self._process()
        assert result["event"] == "test"

    def test_redacts_authorization_header(self) -> None:
        result = self._process(authorization="Bearer abc.def.ghi")
        assert result["authorization"] == "[REDACTED]"

    def test_redacts_secret(self) -> None:
        result = self._process(secret="super-secret-value")
        assert result["secret"] == "[REDACTED]"

    def test_does_not_crash_on_non_string_value(self) -> None:
        result = self._process(count=42, items=["a", "b"], active=True)
        assert result["count"] == 42
        assert result["items"] == ["a", "b"]
        assert result["active"] is True
