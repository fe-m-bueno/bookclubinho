"""Um teste por flow de login, afirmando que o audit log registra o que deveria.

A cauda `tokens → sessão → commit → cookies → audit` estava copiada três vezes,
e os handlers a orquestravam à mão em ordens diferentes. O que se paga por isso
não é elegância: são buracos no audit log.

- `refresh` e `logout` não escreviam linha nenhuma — `TOKEN_REFRESH` e `LOGOUT`
  eram constantes definidas e nunca chamadas.
- `google_callback` chamava `log_event(..., request=None)`, então `ip_hash` e
  `user_agent` nunca eram capturados para login via OAuth — diferente dos
  outros dois flows.
- Nenhum dos três passava `user_id`, então a linha de `login_success` não podia
  ser atribuída a ninguém.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.auth import router as auth_router
from app.db.models.audit_log import AuditLog
from app.services.audit import (
    LOGIN_FAILED,
    LOGIN_SUCCESS,
    LOGOUT,
    MAGIC_LINK_SENT,
    MAGIC_LINK_USED,
    OAUTH_LOGIN,
    REGISTER,
    TOKEN_REFRESH,
)

app = FastAPI()
app.include_router(auth_router, prefix="/api/v1/auth")

CLIENT_IP = "203.0.113.7"
USER_AGENT = "Mozilla/5.0 (Verificador)"


def _make_user(*, onboarding_completed: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "ana@example.com"
    user.display_name = "Ana"
    user.onboarding_completed = onboarding_completed
    user.is_active = True
    return user


class _RecordingSession:
    """Coleta o que foi adicionado à sessão — as linhas de audit inclusive."""

    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1

    async def flush(self) -> None:
        pass

    async def rollback(self) -> None:
        pass

    async def execute(self, *_a: object, **_kw: object) -> MagicMock:
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        result.scalars.return_value.all.return_value = []
        return result

    @property
    def audit_rows(self) -> list[AuditLog]:
        return [o for o in self.added if isinstance(o, AuditLog)]

    def audit(self, action: str) -> AuditLog | None:
        for row in self.audit_rows:
            if row.action == action:
                return row
        return None


class _RollbackOnErrorSession(_RecordingSession):
    """Como o `get_session`: o que não foi commitado morre no rollback.

    O dublê que só registra `add` não distingue "a linha foi escrita" de "a
    linha foi adicionada e descartada", e é exatamente aí que estava o buraco do
    `login_failed`.
    """

    def __init__(self) -> None:
        super().__init__()
        self.committed: list[object] = []

    async def commit(self) -> None:
        self.commits += 1
        self.committed.extend(self.added)
        self.added = []

    async def rollback(self) -> None:
        self.added = []

    @property
    def audit_rows(self) -> list[AuditLog]:
        return [o for o in (*self.committed, *self.added) if isinstance(o, AuditLog)]


def _client(session: _RecordingSession) -> TestClient:
    from app.core.deps import get_session

    async def fake_session():
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()

    app.dependency_overrides[get_session] = fake_session
    return TestClient(
        app,
        raise_server_exceptions=False,
        headers={"User-Agent": USER_AGENT},
        client=(CLIENT_IP, 5000),
    )


def _assert_request_meta(row: AuditLog | None, action: str) -> None:
    """A linha existe e sabe de onde veio."""
    assert row is not None, f"nenhuma linha de audit para {action}"
    assert row.ip_hash, f"{action} sem ip_hash"
    assert row.user_agent == USER_AGENT[:200], f"{action} sem user_agent"


class TestLoginAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_password_login(self) -> None:
        session = _RecordingSession()
        user = _make_user()
        with (
            patch(
                "app.api.v1.endpoints.auth.authenticate_user",
                new_callable=AsyncMock,
                return_value=user,
            ),
            patch("app.api.v1.endpoints.auth.establish_session", new_callable=AsyncMock) as est,
        ):
            resp = _client(session).post(
                "/api/v1/auth/login",
                data={"username": "ana@example.com", "password": "senha"},
            )
        assert resp.status_code == 200
        # O handler não orquestra mais os passos finais à mão.
        est.assert_awaited_once()

    def test_password_login_writes_the_audit_row(self) -> None:
        """Sem mockar a cauda: a linha sai com ação, usuário e origem."""
        session = _RecordingSession()
        user = _make_user()
        with (
            patch(
                "app.api.v1.endpoints.auth.authenticate_user",
                new_callable=AsyncMock,
                return_value=user,
            ),
            patch(
                "app.services.login_session.create_token_pair",
                return_value=("acc", "ref"),
            ),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            resp = _client(session).post(
                "/api/v1/auth/login",
                data={"username": "ana@example.com", "password": "senha"},
            )
        assert resp.status_code == 200
        row = session.audit(LOGIN_SUCCESS)
        _assert_request_meta(row, LOGIN_SUCCESS)
        assert row is not None
        assert row.user_id == user.id, "a linha de login não é atribuível a ninguém"

    def test_failed_login_survives_the_rollback(self) -> None:
        """A linha de `login_failed` era perdida — zero linhas na tabela inteira.

        O handler chamava `log_event` e levantava `HTTPException` em seguida.
        `log_event` não commita de propósito (o caller é dono da transação), mas
        no caminho de erro não existe caller que commite: `get_session` faz
        rollback quando a exceção sobe, e a linha ia com ele.

        Medido no banco de e2e depois de uma tentativa de login errada pela UI:
        `select count(*) from audit_log where action = 'login_failed'` → 0, com
        `login_success`, `register` e `logout` todos presentes.

        O dublê aqui faz rollback como o `get_session` faz. Sem isso o teste
        passa afirmando só que a chamada aconteceu, não que a linha sobreviveu.
        """
        from app.services.auth import AuthError

        session = _RollbackOnErrorSession()
        with patch(
            "app.api.v1.endpoints.auth.authenticate_user",
            new_callable=AsyncMock,
            side_effect=AuthError("Credenciais inválidas."),
        ):
            resp = _client(session).post(
                "/api/v1/auth/login",
                data={"username": "ana@example.com", "password": "errada"},
            )
        assert resp.status_code == 401
        _assert_request_meta(session.audit(LOGIN_FAILED), LOGIN_FAILED)


class TestMagicLinkAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_magic_link_requested_is_audited(self) -> None:
        """`MAGIC_LINK_SENT` era definida e nunca chamada."""
        session = _RecordingSession()
        with patch("app.api.v1.endpoints.auth.send_magic_link", new_callable=AsyncMock):
            resp = _client(session).post(
                "/api/v1/auth/magic-link",
                json={"email": "ana@example.com"},
            )
        assert resp.status_code == 200
        _assert_request_meta(session.audit(MAGIC_LINK_SENT), MAGIC_LINK_SENT)

    def test_magic_link_used(self) -> None:
        session = _RecordingSession()
        user = _make_user()
        with (
            patch(
                "app.api.v1.endpoints.auth.consume_magic_token",
                new_callable=AsyncMock,
                return_value=user,
            ),
            patch(
                "app.services.login_session.create_token_pair",
                return_value=("acc", "ref"),
            ),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            resp = _client(session).get(
                "/api/v1/auth/magic/callback?token=tok",
                follow_redirects=False,
            )
        assert resp.status_code == 303
        row = session.audit(MAGIC_LINK_USED)
        _assert_request_meta(row, MAGIC_LINK_USED)
        assert row is not None
        assert row.user_id == user.id


class TestOAuthAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_oauth_login_captures_ip_and_user_agent(self) -> None:
        """Era `log_event(..., request=None)` — o único flow sem origem."""
        session = _RecordingSession()
        user = _make_user()
        redis = MagicMock()
        redis.get = AsyncMock(return_value="1")
        redis.delete = AsyncMock()
        with (
            patch("app.api.v1.endpoints.auth.get_redis", return_value=redis),
            patch(
                "app.api.v1.endpoints.auth.google_oauth_callback",
                new_callable=AsyncMock,
                return_value=user,
            ),
            patch(
                "app.services.login_session.create_token_pair",
                return_value=("acc", "ref"),
            ),
            patch("app.services.login_session._create_session", new_callable=AsyncMock),
        ):
            resp = _client(session).get(
                "/api/v1/auth/google/callback?code=abc&state=xyz",
                follow_redirects=False,
            )
        assert resp.status_code == 303
        row = session.audit(OAUTH_LOGIN)
        _assert_request_meta(row, OAUTH_LOGIN)
        assert row is not None
        assert row.user_id == user.id


class TestRefreshAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_refresh_is_audited(self) -> None:
        """`TOKEN_REFRESH` era definida e nunca chamada."""
        session = _RecordingSession()
        with patch(
            "app.services.login_session.rotate_refresh_token",
            new_callable=AsyncMock,
            return_value=("new_acc", "new_ref"),
        ):
            client = _client(session)
            client.cookies.set("refresh_token", "old.token")
            resp = client.post("/api/v1/auth/refresh")
        assert resp.status_code == 200
        _assert_request_meta(session.audit(TOKEN_REFRESH), TOKEN_REFRESH)

    def test_refresh_passes_the_db_so_the_session_row_is_updated(self) -> None:
        """`rotate_refresh_token(token, db=None)` tinha um trecho morto pelo HTTP.

        O endpoint chamava sem `db`, então `last_active_at` e o
        `refresh_token_jti` da sessão nunca eram atualizados em produção.
        """
        session = _RecordingSession()
        with patch(
            "app.services.login_session.rotate_refresh_token",
            new_callable=AsyncMock,
            return_value=("new_acc", "new_ref"),
        ) as rotate:
            client = _client(session)
            client.cookies.set("refresh_token", "old.token")
            resp = client.post("/api/v1/auth/refresh")
        assert resp.status_code == 200
        assert rotate.await_args is not None
        assert rotate.await_args.kwargs.get("db") is session


class TestLogoutAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_logout_is_audited(self) -> None:
        """`LOGOUT` era definida e nunca chamada — o handler não tinha nem `db`."""
        session = _RecordingSession()
        with patch(
            "app.services.login_session.blacklist_refresh_token",
            new_callable=AsyncMock,
        ):
            client = _client(session)
            client.cookies.set("refresh_token", "some.token")
            resp = client.post("/api/v1/auth/logout")
        assert resp.status_code == 200
        _assert_request_meta(session.audit(LOGOUT), LOGOUT)


class TestRegisterAudit:
    def teardown_method(self) -> None:
        app.dependency_overrides.clear()

    def test_register_is_audited(self) -> None:
        """`REGISTER` era definida e nunca chamada."""
        session = _RecordingSession()
        with patch("app.api.v1.endpoints.auth.register_user", new_callable=AsyncMock):
            resp = _client(session).post(
                "/api/v1/auth/register",
                json={
                    "email": "nova@example.com",
                    "password": "SenhaForte#2026",
                    "display_name": "Nova",
                },
            )
        assert resp.status_code == 201
        _assert_request_meta(session.audit(REGISTER), REGISTER)
