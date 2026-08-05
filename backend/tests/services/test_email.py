"""Testes de app.services.email.

Este arquivo não existia, e é por isso que três bugs moraram aqui:

- `_user_display` era `return self._user_display(user)` — recursão infinita, e
  cinco emails de notificação nunca saíam (#214).
- Os wrappers síncronos chamavam `_send_sync` direto, pulando o try/except que
  existe em `_send` (#213).
- Com isso, `register` devolvia 500 quando a entrega falhava, depois de já ter
  commitado a conta — e como login exige `email_verified` e reenviar é no-op
  silencioso, o endereço ficava travado (#212).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import email as email_module
from app.services.email import EmailService, email_service


def _user(**overrides: object) -> MagicMock:
    u = MagicMock()
    u.id = overrides.get("id", "u-1")
    u.email = overrides.get("email", "leitor@example.com")
    u.username = overrides.get("username", "leitor")
    u.display_name = overrides.get("display_name", "Leitor")
    u.email_notifications = overrides.get("email_notifications", {})
    return u


# ── _user_display (#214) ──────────────────────────────────────────────────────


class TestUserDisplay:
    def test_prefers_display_name(self) -> None:
        assert email_service._user_display(_user(display_name="Felipe")) == "Felipe"

    def test_falls_back_to_username(self) -> None:
        u = _user(display_name=None, username="fe")
        assert email_service._user_display(u) == "fe"

    def test_falls_back_to_email(self) -> None:
        u = _user(display_name=None, username=None, email="x@y.z")
        assert email_service._user_display(u) == "x@y.z"

    def test_does_not_recurse(self) -> None:
        """O bug: `return self._user_display(user)` estourava a pilha."""
        try:
            email_service._user_display(_user())
        except RecursionError:  # pragma: no cover
            pytest.fail("_user_display recursed into itself")


# ── Os 5 emails que dependiam do _user_display (#214) ─────────────────────────


class TestUserAddressedEmails:
    """Nenhum destes funcionava: a recursão estourava ao montar os argumentos de
    `_render`, antes de `_send` — então o try/except de `_send` nem era alcançado."""

    METHODS = [
        (
            "send_invite_notification",
            {"group_name": "Clube", "inviter_name": "Ana", "invite_url": "http://x"},
        ),
        (
            "send_approaching_end",
            {
                "group_name": "Clube",
                "reader_name": "Ana",
                "progress_percent": 85.0,
                "group_url": "http://x",
            },
        ),
        (
            "send_post_digest",
            {"group_name": "Clube", "messages_preview": ["oi"], "group_url": "http://x"},
        ),
        (
            "send_badge_earned",
            {"badge_name": "Fundador", "badge_emoji": "🏗️", "badge_description": "Criou um clube"},
        ),
        (
            "send_wrapped_ready",
            {"group_name": "Clube", "year": 2026, "wrapped_url": "http://x"},
        ),
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("method", "kwargs"), METHODS)
    async def test_sends_without_recursion(self, method: str, kwargs: dict) -> None:
        svc = EmailService()
        # todas as categorias ligadas: aqui o assunto é a recursão, não preferência
        user = _user(
            email_notifications=dict.fromkeys(("meetings", "invites", "auth", "approaching_end", "all_updates"), True)
        )

        with patch.object(svc, "_send", new=AsyncMock()) as mock_send:
            await getattr(svc, method)(user, **kwargs)

        assert mock_send.await_count == 1, f"{method} não chegou a enviar"
        assert mock_send.await_args.args[0] == user.email

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("method", "kwargs"), METHODS)
    async def test_renders_the_display_name_into_the_html(self, method: str, kwargs: dict) -> None:
        """Prova que o nome resolvido chega ao template — era o argumento que
        estourava a pilha."""
        svc = EmailService()
        user = _user(
            display_name="Felipe",
            email_notifications=dict.fromkeys(("meetings", "invites", "auth", "approaching_end", "all_updates"), True),
        )

        with (
            patch.object(svc, "_send", new=AsyncMock()),
            patch.object(svc, "_render", return_value="<p>x</p>") as mock_render,
        ):
            await getattr(svc, method)(user, **kwargs)

        assert mock_render.call_args.kwargs.get("display_name") == "Felipe"


# ── Os wrappers síncronos (#213) ──────────────────────────────────────────────


class TestSyncWrappersSwallowFailures:
    """Contrato: os wrappers nunca levantam. Quem chama — inclusive
    `auth.register_user` via `asyncio.to_thread` — não pode quebrar por causa de
    uma indisponibilidade do Resend."""

    WRAPPERS = [
        ("send_verification_email", {"to_email": "a@b.c", "display_name": "A", "verify_url": "http://x"}),
        ("send_magic_link_email", {"to_email": "a@b.c", "display_name": "A", "magic_url": "http://x"}),
        ("send_email_change_email", {"to_email": "a@b.c", "display_name": "A", "confirm_url": "http://x"}),
        ("send_data_export_email", {"to_email": "a@b.c", "display_name": "A", "download_url": "http://x"}),
    ]

    @pytest.mark.parametrize(("name", "kwargs"), WRAPPERS)
    def test_delivery_failure_does_not_propagate(self, name: str, kwargs: dict) -> None:
        with patch.object(email_service, "_send_sync", side_effect=RuntimeError("Resend fora do ar")):
            getattr(email_module, name)(**kwargs)  # não deve levantar

    @pytest.mark.parametrize(("name", "kwargs"), WRAPPERS)
    def test_render_failure_does_not_propagate(self, name: str, kwargs: dict) -> None:
        """`_render` usa StrictUndefined, então uma variável faltando no template
        levanta — e isso também não pode chegar ao caller."""
        with patch.object(email_service, "_render", side_effect=RuntimeError("template quebrado")):
            getattr(email_module, name)(**kwargs)

    @pytest.mark.parametrize(("name", "kwargs"), WRAPPERS)
    def test_success_path_still_sends(self, name: str, kwargs: dict) -> None:
        with (
            patch.object(email_service, "_render", return_value="<p>oi</p>"),
            patch.object(email_service, "_send_sync", return_value="resend-id") as mock_send,
        ):
            getattr(email_module, name)(**kwargs)

        assert mock_send.call_count == 1
        assert mock_send.call_args.args[0] == kwargs["to_email"]


# ── _send assíncrono ──────────────────────────────────────────────────────────


class TestAsyncSend:
    @pytest.mark.asyncio
    async def test_swallows_and_logs(self) -> None:
        svc = EmailService()
        with patch.object(svc, "_send_sync", side_effect=RuntimeError("boom")):
            await svc._send("a@b.c", "assunto", "<p>x</p>")  # não deve levantar
