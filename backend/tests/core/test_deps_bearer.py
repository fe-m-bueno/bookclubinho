"""Resolução de personal access tokens nas dependências de autenticação."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token
from tests.conftest import make_user, mock_db_returning


def _request(headers: dict[str, str] | None = None) -> MagicMock:
    request = MagicMock()
    request.state = SimpleNamespace()
    request.headers = headers or {}
    return request


class TestBearerResolution:
    @pytest.mark.asyncio
    async def test_valid_pat_authenticates(self) -> None:
        from app.core.deps import get_current_user

        user = make_user()
        db = mock_db_returning(user)

        with (
            patch("app.core.deps.pat.resolve_token", AsyncMock(return_value=user.id)),
            patch("app.core.deps.apply_rls_user", AsyncMock()),
        ):
            resolved = await get_current_user(
                _request({"authorization": "Bearer bcp_valido"}),
                db,
                access_token=None,
            )

        assert resolved is user

    @pytest.mark.asyncio
    async def test_valid_pat_applies_rls_context(self) -> None:
        """O middleware não pôde: token opaco exige banco, e lá não havia sessão."""
        from app.core.deps import get_current_user

        user = make_user()
        apply_rls = AsyncMock()

        with (
            patch("app.core.deps.pat.resolve_token", AsyncMock(return_value=user.id)),
            patch("app.core.deps.apply_rls_user", apply_rls),
        ):
            await get_current_user(
                _request({"authorization": "Bearer bcp_valido"}),
                mock_db_returning(user),
                access_token=None,
            )

        apply_rls.assert_awaited_once()
        assert apply_rls.await_args[0][1] == str(user.id)

    @pytest.mark.asyncio
    async def test_rejected_pat_raises_401(self) -> None:
        from app.core.deps import get_current_user

        with patch("app.core.deps.pat.resolve_token", AsyncMock(return_value=None)):
            with pytest.raises(HTTPException) as exc:
                await get_current_user(
                    _request({"authorization": "Bearer bcp_revogado"}),
                    mock_db_returning(None),
                    access_token=None,
                )

        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_bearer_value_raises_401(self) -> None:
        from app.core.deps import get_current_user

        resolve = AsyncMock(return_value=None)
        with patch("app.core.deps.pat.resolve_token", resolve):
            with pytest.raises(HTTPException):
                await get_current_user(_request({"authorization": "Bearer   "}), mock_db_returning(None), None)

        resolve.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_optional_user_is_none_without_credentials(self) -> None:
        from app.core.deps import get_optional_user

        assert await get_optional_user(_request(), mock_db_returning(None), None) is None


class TestCookieWins:
    @pytest.mark.asyncio
    async def test_cookie_takes_precedence_over_bearer(self) -> None:
        """Numa requisição com os dois, quem manda é a sessão de browser.

        É o que impede um `Authorization` de terceiro de reescrever quem o
        usuário é numa aba já autenticada.
        """
        from app.core.deps import get_current_user

        user = make_user()
        cookie_token = create_access_token(str(user.id))
        resolve = AsyncMock(return_value=uuid.uuid4())

        with (
            patch("app.core.deps.pat.resolve_token", resolve),
            patch("app.core.deps.get_rls_user_id", return_value=""),
        ):
            resolved = await get_current_user(
                _request({"authorization": "Bearer bcp_de_outro"}),
                mock_db_returning(user),
                access_token=cookie_token,
            )

        assert resolved is user
        resolve.assert_not_awaited()


class TestSessionOnlyGuard:
    @pytest.mark.asyncio
    async def test_bearer_cannot_manage_tokens(self) -> None:
        """Um token que cria tokens deixaria de ser credencial limitada."""
        from app.core.deps import get_current_user_session_only

        request = _request()
        request.state._authenticated_via_bearer = True

        with pytest.raises(HTTPException) as exc:
            await get_current_user_session_only(request, make_user())

        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_cookie_session_can_manage_tokens(self) -> None:
        from app.core.deps import get_current_user_session_only

        user = make_user()
        assert await get_current_user_session_only(_request(), user) is user
