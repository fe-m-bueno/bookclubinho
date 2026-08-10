"""Tests do serviço de personal access tokens."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.security import (
    PAT_PREFIX,
    generate_personal_access_token,
    hash_personal_access_token,
    personal_access_token_prefix,
)
from app.db.models.personal_access_token import PersonalAccessToken
from app.services.pat import (
    MAX_TOKENS_PER_USER,
    PATError,
    create_token,
    list_tokens,
    resolve_token,
    revoke_token,
)


def _db_returning(value: object) -> AsyncMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    return db


def _db_counting(quantos: int) -> AsyncMock:
    """Sessão cujo `execute` responde a um `select(func.count())`."""
    result = MagicMock()
    result.scalar_one.return_value = quantos
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    return db


def _db_returning_all(values: list[object]) -> AsyncMock:
    scalars = MagicMock()
    scalars.all.return_value = values
    result = MagicMock()
    result.scalars.return_value = scalars
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    return db


def _make_token(**overrides: object) -> PersonalAccessToken:
    raw = overrides.pop("raw", generate_personal_access_token())
    token = PersonalAccessToken(
        user_id=overrides.get("user_id", uuid.uuid4()),
        name=overrides.get("name", "cli"),
        token_hash=hash_personal_access_token(str(raw)),
        prefix=personal_access_token_prefix(str(raw)),
    )
    token.id = overrides.get("id", uuid.uuid4())
    token.expires_at = overrides.get("expires_at")
    token.revoked_at = overrides.get("revoked_at")
    token.last_used_at = overrides.get("last_used_at")
    return token


# ── Primitivas ────────────────────────────────────────────────────────────────


class TestPrimitives:
    def test_token_carries_prefix(self) -> None:
        assert generate_personal_access_token().startswith(PAT_PREFIX)

    def test_tokens_are_unique(self) -> None:
        tokens = {generate_personal_access_token() for _ in range(100)}
        assert len(tokens) == 100

    def test_hash_is_stable_and_not_the_token(self) -> None:
        raw = generate_personal_access_token()
        assert hash_personal_access_token(raw) == hash_personal_access_token(raw)
        assert raw not in hash_personal_access_token(raw)

    def test_display_prefix_is_a_strict_truncation(self) -> None:
        """O prefixo exibido não pode bastar para reconstruir o token."""
        raw = generate_personal_access_token()
        shown = personal_access_token_prefix(raw)
        assert raw.startswith(shown)
        assert len(shown) < len(raw)


# ── create_token ──────────────────────────────────────────────────────────────


class TestCreateToken:
    @pytest.mark.asyncio
    async def test_stores_hash_never_the_token(self) -> None:
        db = _db_counting(0)
        token, raw = await create_token(db, uuid.uuid4(), "meu-cli")

        assert token.token_hash == hash_personal_access_token(raw)
        assert token.token_hash != raw

    @pytest.mark.asyncio
    async def test_returns_token_in_clear_once(self) -> None:
        db = _db_counting(0)
        _token, raw = await create_token(db, uuid.uuid4(), "meu-cli")
        assert raw.startswith(PAT_PREFIX)

    @pytest.mark.asyncio
    async def test_no_expiry_by_default(self) -> None:
        db = _db_counting(0)
        token, _raw = await create_token(db, uuid.uuid4(), "meu-cli")
        assert token.expires_at is None

    @pytest.mark.asyncio
    async def test_expiry_is_computed_from_days(self) -> None:
        db = _db_counting(0)
        token, _raw = await create_token(db, uuid.uuid4(), "meu-cli", expires_in_days=30)

        assert token.expires_at is not None
        delta = token.expires_at - datetime.now(UTC)
        assert timedelta(days=29) < delta <= timedelta(days=30)

    @pytest.mark.asyncio
    async def test_rejects_past_the_active_limit(self) -> None:
        db = _db_counting(MAX_TOKENS_PER_USER)

        with pytest.raises(PATError) as exc:
            await create_token(db, uuid.uuid4(), "mais um")
        assert exc.value.status_code == 409


# ── resolve_token ─────────────────────────────────────────────────────────────


class TestResolveToken:
    @pytest.mark.asyncio
    async def test_resolves_a_valid_token_to_its_owner(self) -> None:
        raw = generate_personal_access_token()
        owner = uuid.uuid4()
        db = _db_returning(_make_token(raw=raw, user_id=owner))

        assert await resolve_token(db, raw) == owner

    @pytest.mark.asyncio
    async def test_unknown_token_returns_none(self) -> None:
        db = _db_returning(None)
        assert await resolve_token(db, generate_personal_access_token()) is None

    @pytest.mark.asyncio
    async def test_expired_token_returns_none(self) -> None:
        raw = generate_personal_access_token()
        db = _db_returning(_make_token(raw=raw, expires_at=datetime.now(UTC) - timedelta(seconds=1)))

        assert await resolve_token(db, raw) is None

    @pytest.mark.asyncio
    async def test_token_expiring_later_still_resolves(self) -> None:
        raw = generate_personal_access_token()
        owner = uuid.uuid4()
        db = _db_returning(_make_token(raw=raw, user_id=owner, expires_at=datetime.now(UTC) + timedelta(days=1)))

        assert await resolve_token(db, raw) == owner

    @pytest.mark.asyncio
    async def test_foreign_credential_never_touches_the_db(self) -> None:
        """Um Authorization que não é PAT não pode custar um SELECT por requisição."""
        db = _db_returning(None)
        assert await resolve_token(db, "eyJhbGciOiJIUzI1NiJ9.qualquer.jwt") is None
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_wrong_secret_with_right_prefix_returns_none(self) -> None:
        db = _db_returning(None)
        assert await resolve_token(db, f"{PAT_PREFIX}chute-errado") is None

    @pytest.mark.asyncio
    async def test_touches_last_used_when_stale(self) -> None:
        raw = generate_personal_access_token()
        token = _make_token(raw=raw, last_used_at=datetime.now(UTC) - timedelta(hours=1))
        await resolve_token(_db_returning(token), raw)

        assert token.last_used_at is not None
        assert datetime.now(UTC) - token.last_used_at < timedelta(seconds=5)

    @pytest.mark.asyncio
    async def test_does_not_touch_last_used_when_recent(self) -> None:
        """Sem essa folga, toda requisição por Bearer viraria um UPDATE."""
        raw = generate_personal_access_token()
        recent = datetime.now(UTC) - timedelta(seconds=30)
        token = _make_token(raw=raw, last_used_at=recent)
        await resolve_token(_db_returning(token), raw)

        assert token.last_used_at == recent


# ── revoke / list ─────────────────────────────────────────────────────────────


class TestRevokeToken:
    @pytest.mark.asyncio
    async def test_marks_revoked_at(self) -> None:
        token = _make_token()
        db = _db_returning(token)
        await revoke_token(db, user_id=token.user_id, token_id=token.id)

        assert token.revoked_at is not None

    @pytest.mark.asyncio
    async def test_missing_token_raises_404(self) -> None:
        db = _db_returning(None)
        with pytest.raises(PATError) as exc:
            await revoke_token(db, user_id=uuid.uuid4(), token_id=uuid.uuid4())
        assert exc.value.status_code == 404


class TestListTokens:
    @pytest.mark.asyncio
    async def test_returns_the_users_tokens(self) -> None:
        tokens = [_make_token(), _make_token()]
        assert await list_tokens(_db_returning_all(tokens), uuid.uuid4()) == tokens
