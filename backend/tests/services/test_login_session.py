"""A ordem da cauda de login, que era convenção e passa a ser garantia.

Os três flows faziam `tokens → sessão → commit` no service e então o handler
escrevia cookies e audit — em ordens diferentes entre si. Duas consequências que
estes testes fixam:

- A linha de audit entra na **mesma transação** que os tokens e a sessão. Antes o
  service commitava e só então o handler adicionava a linha, que persistia no
  auto-commit do `get_session`: uma segunda transação, com um instante em que a
  sessão existe e o registro dela não.
- Os cookies vêm **depois** do commit. Se o commit falhar, o browser não sai com
  credenciais para uma sessão que não foi gravada.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.requests import Request

from app.db.models.audit_log import AuditLog
from app.services.audit import LOGIN_SUCCESS, LOGOUT, MAGIC_LINK_USED, OAUTH_LOGIN, TOKEN_REFRESH
from app.services.login_session import (
    LoginFlow,
    end_session,
    establish_session,
    renew_session,
)

USER_AGENT = "Mozilla/5.0 (Teste)"
CLIENT_IP = "198.51.100.42"


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(b"user-agent", USER_AGENT.encode())],
            "client": (CLIENT_IP, 5000),
        }
    )


def _user(*, onboarding_completed: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.onboarding_completed = onboarding_completed
    return user


class _OrderedSession:
    """Registra a ordem dos eventos da transação."""

    def __init__(self) -> None:
        self.events: list[str] = []
        self.added: list[object] = []

    def add(self, obj: object) -> None:
        self.added.append(obj)
        self.events.append("audit" if isinstance(obj, AuditLog) else "add")

    async def commit(self) -> None:
        self.events.append("commit")

    async def flush(self) -> None:
        self.events.append("flush")

    async def execute(self, *_a: object, **_kw: object) -> MagicMock:
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        return result

    @property
    def audit_row(self) -> AuditLog:
        rows = [o for o in self.added if isinstance(o, AuditLog)]
        assert len(rows) == 1, f"esperava uma linha de audit, achei {len(rows)}"
        return rows[0]


class _RecordingResponse:
    def __init__(self) -> None:
        self.events: list[str] = []
        self.cookies: list[str] = []
        self.deleted: list[str] = []

    def set_cookie(self, key: str, *_a: object, **_kw: object) -> None:
        self.cookies.append(key)
        self.events.append("set_cookie")

    def delete_cookie(self, key: str, *_a: object, **_kw: object) -> None:
        self.deleted.append(key)
        self.events.append("delete_cookie")


class TestEstablishSession:
    @pytest.mark.asyncio
    async def test_audit_row_lands_before_the_commit(self) -> None:
        db = _OrderedSession()
        response = _RecordingResponse()
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            await establish_session(
                db=db,
                response=response,  # type: ignore[arg-type]
                request=_request(),
                user=_user(),
                flow=LoginFlow.PASSWORD,
            )

        assert db.events.index("audit") < db.events.index("commit")

    @pytest.mark.asyncio
    async def test_cookies_only_after_the_commit(self) -> None:
        """Commit que falha não deve deixar o browser com credenciais."""
        db = _OrderedSession()
        response = _RecordingResponse()

        async def boom() -> None:
            raise RuntimeError("commit falhou")

        db.commit = boom  # type: ignore[method-assign]

        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
            pytest.raises(RuntimeError),
        ):
            await establish_session(
                db=db,
                response=response,  # type: ignore[arg-type]
                request=_request(),
                user=_user(),
                flow=LoginFlow.PASSWORD,
            )

        assert response.cookies == []

    @pytest.mark.asyncio
    async def test_records_who_and_from_where(self) -> None:
        db = _OrderedSession()
        user = _user()
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            await establish_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                user=user,
                flow=LoginFlow.PASSWORD,
            )

        row = db.audit_row
        # Nenhum dos três flows passava `user_id`: a linha de login não era
        # atribuível a ninguém.
        assert row.user_id == user.id
        assert row.user_agent == USER_AGENT
        assert row.ip_hash

    @pytest.mark.asyncio
    async def test_session_row_gets_the_refresh_token_and_the_origin(self) -> None:
        db = _OrderedSession()
        user = _user()
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock) as create,
        ):
            await establish_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                user=user,
                flow=LoginFlow.PASSWORD,
            )

        create.assert_awaited_once_with(db, user.id, "ref", USER_AGENT, CLIENT_IP)

    @pytest.mark.asyncio
    async def test_both_auth_cookies_are_set(self) -> None:
        response = _RecordingResponse()
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            await establish_session(
                db=_OrderedSession(),
                response=response,  # type: ignore[arg-type]
                request=_request(),
                user=_user(),
                flow=LoginFlow.PASSWORD,
            )

        assert set(response.cookies) == {"access_token", "refresh_token"}

    @pytest.mark.asyncio
    async def test_onboarding_flag_reaches_the_token(self) -> None:
        user = _user(onboarding_completed=False)
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")) as ctp,
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            await establish_session(
                db=_OrderedSession(),
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                user=user,
                flow=LoginFlow.PASSWORD,
            )

        ctp.assert_called_once_with(str(user.id), onboarding_completed=False)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("flow", "action"),
        [
            (LoginFlow.PASSWORD, LOGIN_SUCCESS),
            (LoginFlow.MAGIC_LINK, MAGIC_LINK_USED),
            (LoginFlow.GOOGLE_OAUTH, OAUTH_LOGIN),
        ],
    )
    async def test_flow_decides_the_action(self, flow: LoginFlow, action: str) -> None:
        """O motivo do login é parâmetro obrigatório, não uma linha a lembrar."""
        db = _OrderedSession()
        with (
            patch("app.services.login_session.create_token_pair", return_value=("acc", "ref")),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            await establish_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                user=_user(),
                flow=flow,
            )

        assert db.audit_row.action == action


class TestRenewSession:
    @pytest.mark.asyncio
    async def test_passes_the_db_to_the_rotation(self) -> None:
        """`rotate_refresh_token(token, db=None)` tinha um trecho morto pelo HTTP."""
        db = _OrderedSession()
        with patch(
            "app.services.login_session.rotate_refresh_token",
            new_callable=AsyncMock,
            return_value=("new_acc", "new_ref"),
        ) as rotate:
            await renew_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                refresh_token="old",
            )

        rotate.assert_awaited_once_with("old", db=db)

    @pytest.mark.asyncio
    async def test_audits_the_refresh(self) -> None:
        db = _OrderedSession()
        with patch(
            "app.services.login_session.rotate_refresh_token",
            new_callable=AsyncMock,
            return_value=("new_acc", "new_ref"),
        ):
            await renew_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                refresh_token="old",
            )

        row = db.audit_row
        assert row.action == TOKEN_REFRESH
        assert row.ip_hash
        assert db.events.index("audit") < db.events.index("commit")

    @pytest.mark.asyncio
    async def test_rotation_failure_leaves_the_old_cookies_alone(self) -> None:
        from app.services.auth import AuthError

        response = _RecordingResponse()
        with (
            patch(
                "app.services.login_session.rotate_refresh_token",
                new_callable=AsyncMock,
                side_effect=AuthError("Token revogado.", status_code=401),
            ),
            pytest.raises(AuthError),
        ):
            await renew_session(
                db=_OrderedSession(),
                response=response,  # type: ignore[arg-type]
                request=_request(),
                refresh_token="revogado",
            )

        assert response.events == []


class TestEndSession:
    @pytest.mark.asyncio
    async def test_blacklists_audits_and_clears(self) -> None:
        db = _OrderedSession()
        response = _RecordingResponse()
        with patch(
            "app.services.login_session.blacklist_refresh_token",
            new_callable=AsyncMock,
        ) as blacklist:
            await end_session(
                db=db,
                response=response,  # type: ignore[arg-type]
                request=_request(),
                refresh_token="tok",
            )

        blacklist.assert_awaited_once_with("tok")
        assert db.audit_row.action == LOGOUT
        assert set(response.deleted) == {"access_token", "refresh_token"}

    @pytest.mark.asyncio
    async def test_no_token_still_clears_the_cookies(self) -> None:
        """O usuário pediu para sair; deixar credenciais no browser seria pior."""
        db = _OrderedSession()
        response = _RecordingResponse()
        with patch(
            "app.services.login_session.blacklist_refresh_token",
            new_callable=AsyncMock,
        ) as blacklist:
            await end_session(
                db=db,
                response=response,  # type: ignore[arg-type]
                request=_request(),
                refresh_token=None,
            )

        blacklist.assert_not_awaited()
        assert db.audit_row.action == LOGOUT
        assert set(response.deleted) == {"access_token", "refresh_token"}

    @pytest.mark.asyncio
    async def test_attributes_the_logout_when_the_user_is_known(self) -> None:
        db = _OrderedSession()
        user_id = uuid.uuid4()
        with patch("app.services.login_session.blacklist_refresh_token", new_callable=AsyncMock):
            await end_session(
                db=db,
                response=_RecordingResponse(),  # type: ignore[arg-type]
                request=_request(),
                refresh_token="tok",
                user_id=user_id,
            )

        assert db.audit_row.user_id == user_id
