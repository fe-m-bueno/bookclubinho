"""Guarda-corpo contra dependências com CVE conhecido sem correção.

Se um teste aqui falhar, a dependência voltou à árvore — resolva a origem
(`pip show <pkg>` → campo Required-by) em vez de relaxar o teste.
"""

from __future__ import annotations

import importlib.metadata as importlib_metadata
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    extract_access_token_sub,
    extract_refresh_token_jti,
)

# Distribuição → motivo do banimento.
BANNED_DISTRIBUTIONS = {
    # Minerva timing attack — sem versão corrigida; upstream declarou fora de escopo.
    "ecdsa": "PYSEC-2026-1325 / GHSA-h4gh-qq45-vh27 — sem correção disponível",
    # Sem manutenção e único motivo de `ecdsa` estar na árvore. Use PyJWT.
    "python-jose": "arrasta `ecdsa`; substituído por PyJWT",
}


def _installed_distributions() -> set[str]:
    names = set()
    for dist in importlib_metadata.distributions():
        name = dist.metadata["Name"]
        if name:
            names.add(name.lower())
    return names


def test_no_banned_distributions_installed() -> None:
    installed = _installed_distributions()
    found = {name: reason for name, reason in BANNED_DISTRIBUTIONS.items() if name in installed}
    assert not found, "Dependências com CVE presentes: " + "; ".join(f"{k} ({v})" for k, v in found.items())


def test_jwt_backend_is_pyjwt() -> None:
    """Os módulos de auth devem usar PyJWT — não `jose`."""
    from app.core import security as security_module
    from app.services import auth as auth_module

    for module in (security_module, auth_module):
        assert module.jwt.__name__ == "jwt", f"{module.__name__} não está usando PyJWT"


class TestTokenRoundTrip:
    """Contrato de encode/decode preservado após a troca de biblioteca."""

    def test_access_token_round_trip(self) -> None:
        token = create_access_token("user-123", extra_claims={"onb": True})
        payload = decode_token(token)

        assert payload["sub"] == "user-123"
        assert payload["type"] == "access"
        assert payload["onb"] is True
        assert extract_access_token_sub(token) == "user-123"

    def test_refresh_token_carries_jti(self) -> None:
        token = create_refresh_token("user-456")
        payload = decode_token(token)

        assert payload["type"] == "refresh"
        assert payload["jti"]
        assert extract_refresh_token_jti(token) == payload["jti"]

    def test_expired_token_raises(self) -> None:
        expired = create_access_token("user-123", expires_delta=timedelta(seconds=-10))

        with pytest.raises(jwt.PyJWTError):
            decode_token(expired)

    def test_expired_access_token_returns_none_instead_of_raising(self) -> None:
        expired = create_access_token("user-123", expires_delta=timedelta(seconds=-10))
        assert extract_access_token_sub(expired) is None

    def test_extract_refresh_jti_ignores_expiry(self) -> None:
        """`extract_refresh_token_jti` usa verify_exp=False — deve ler o JTI de token expirado."""
        payload = {
            "sub": "user-789",
            "type": "refresh",
            "jti": "known-jti",
            "exp": datetime.now(UTC) - timedelta(days=1),
        }
        from app.core.config import settings

        expired = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

        assert extract_refresh_token_jti(expired) == "known-jti"

    def test_tampered_signature_is_rejected(self) -> None:
        token = create_access_token("user-123")
        tampered = token[:-4] + ("aaaa" if not token.endswith("aaaa") else "bbbb")

        with pytest.raises(jwt.PyJWTError):
            decode_token(tampered)

    def test_access_token_is_not_accepted_as_refresh(self) -> None:
        access = create_access_token("user-123")
        assert extract_refresh_token_jti(access) is None
