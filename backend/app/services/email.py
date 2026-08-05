"""Email service — sends transactional emails via Resend with Jinja2 templates."""

from __future__ import annotations

import asyncio
import pathlib
from typing import TYPE_CHECKING, Literal

import jinja2
import resend
import structlog

from app.core.config import settings

if TYPE_CHECKING:
    from app.db.models.meeting import Meeting
    from app.db.models.user import User

logger = structlog.get_logger(__name__)

_TEMPLATES_DIR = pathlib.Path(__file__).parent.parent.parent / "templates"

_EMAIL_NOTIFICATION_DEFAULTS: dict[str, bool] = {
    "meetings": True,
    "invites": True,
    "auth": True,
    "approaching_end": False,
    "all_updates": False,
}


def _frontend_url() -> str:
    """Return the configured frontend URL, falling back to APP_URL."""
    return getattr(settings, "FRONTEND_URL", settings.APP_URL)


class EmailService:
    """Centralized email service using Jinja2 templates and Resend API."""

    def __init__(self) -> None:
        resend.api_key = settings.RESEND_API_KEY
        # A regra pressupõe Flask/render_template. Aqui o autoescape está ligado
        # explicitamente abaixo, que é a proteção que a regra quer garantir.
        # nosemgrep: python.flask.security.xss.audit.direct-use-of-jinja2.direct-use-of-jinja2
        self._env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(_TEMPLATES_DIR)),
            autoescape=True,
            undefined=jinja2.StrictUndefined,
        )

    def _render(self, template_name: str, **ctx: object) -> str:
        """Render a template, always injecting app_url."""
        ctx.setdefault("app_url", _frontend_url())
        template = self._env.get_template(template_name)
        # Templates são estáticos (arquivos em templates/), nunca vêm de input do usuário,
        # e o Environment acima usa autoescape=True.
        # nosemgrep: python.flask.security.xss.audit.direct-use-of-jinja2.direct-use-of-jinja2
        return template.render(**ctx)

    def _user_display(self, user: User) -> str:
        """Resolve user's display name with fallback."""
        return user.display_name or user.username or user.email

    def _send_sync(self, to: str, subject: str, html: str) -> str | None:
        """Send email synchronously via Resend. Returns email ID or None."""
        params: resend.Emails.SendParams = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        response = resend.Emails.send(params)
        email_id: str | None = response.get("id")
        return email_id

    async def _send(self, to: str, subject: str, html: str) -> None:
        """Send email asynchronously (runs sync Resend call in thread)."""
        try:
            email_id = await asyncio.to_thread(self._send_sync, to, subject, html)
            logger.info("email_sent", to=to, subject=subject, resend_id=email_id)
        except Exception:
            logger.exception("email_send_failed", to=to, subject=subject)

    def _check_preference(self, user_notifications: dict[str, bool], category: str) -> bool:
        """Return True if user has enabled notifications for the given category."""
        default = _EMAIL_NOTIFICATION_DEFAULTS.get(category, False)
        return bool(user_notifications.get(category, default))

    # ── Auth emails (always send, no preference check) ─────────────────────

    async def send_verification(self, to: str, display_name: str, verify_url: str) -> None:
        """Send email address verification link."""
        html = self._render(
            "emails/verification.html",
            display_name=display_name,
            verify_url=verify_url,
        )
        await self._send(to, "Bookclub — confirme seu e-mail", html)

    async def send_magic_link(self, to: str, display_name: str, magic_url: str) -> None:
        """Send magic login link."""
        html = self._render(
            "emails/magic_link.html",
            display_name=display_name,
            magic_url=magic_url,
        )
        await self._send(to, "Bookclub — seu link de acesso", html)

    async def send_email_change(self, to: str, display_name: str, confirm_url: str) -> None:
        """Send email address change confirmation link."""
        html = self._render(
            "emails/email_change.html",
            display_name=display_name,
            confirm_url=confirm_url,
        )
        await self._send(to, "Bookclub — confirme seu novo e-mail", html)

    async def send_account_locked_warning(self, to: str, display_name: str) -> None:
        """Send account lockout security warning after repeated failed logins."""
        settings_url = f"{_frontend_url()}/settings/account"
        html = self._render(
            "emails/account_locked.html",
            display_name=display_name,
            settings_url=settings_url,
        )
        await self._send(to, "Bookclub — alerta de segurança: conta bloqueada temporariamente", html)

    async def send_data_export(self, to: str, display_name: str, download_url: str) -> None:
        """Send data export download link."""
        html = self._render(
            "emails/data_export.html",
            display_name=display_name,
            download_url=download_url,
        )
        await self._send(to, "Bookclub — seus dados estão prontos", html)

    # ── Notification emails (check preferences) ────────────────────────────

    async def send_meeting_reminder(
        self,
        user: User,
        meeting: Meeting,
        time_until: Literal["24h", "1h"],
    ) -> None:
        """Send a meeting reminder respecting user notification preferences."""
        if not self._check_preference(user.email_notifications, "meetings"):
            return
        time_label = "em 24 horas" if time_until == "24h" else "em 1 hora"
        meeting_url = f"{_frontend_url()}/meetings/{meeting.id}"
        scheduled_at_formatted = meeting.scheduled_at.strftime("%d/%m/%Y às %H:%M")
        group = getattr(meeting, "group", None)
        group_name = group.name if group else "seu clube"
        html = self._render(
            "emails/meeting_reminder.html",
            display_name=self._user_display(user),
            meeting_title=meeting.title,
            group_name=group_name,
            scheduled_at_formatted=scheduled_at_formatted,
            time_label=time_label,
            meeting_url=meeting_url,
        )
        subject = f"Bookclub — encontro {time_label}"
        await self._send(user.email, subject, html)

    async def send_invite_notification(
        self,
        user: User,
        group_name: str,
        inviter_name: str,
        invite_url: str,
    ) -> None:
        """Send group invite notification respecting user preferences."""
        if not self._check_preference(user.email_notifications, "invites"):
            return
        html = self._render(
            "emails/invite.html",
            display_name=self._user_display(user),
            inviter_name=inviter_name,
            group_name=group_name,
            invite_url=invite_url,
        )
        subject = f"{inviter_name} te convidou para {group_name}"
        await self._send(user.email, subject, html)

    async def send_approaching_end(
        self,
        user: User,
        group_name: str,
        reader_name: str,
        progress_percent: float,
        group_url: str,
    ) -> None:
        """Notify user that a group member is approaching the end of the book."""
        if not self._check_preference(user.email_notifications, "approaching_end"):
            return
        html = self._render(
            "emails/approaching_end.html",
            display_name=self._user_display(user),
            reader_name=reader_name,
            group_name=group_name,
            progress_percent=int(progress_percent),
            group_url=group_url,
        )
        subject = f"{reader_name} está quase terminando!"
        await self._send(user.email, subject, html)

    async def send_post_digest(
        self,
        user: User,
        group_name: str,
        messages_preview: list[str],
        group_url: str,
    ) -> None:
        """Send a digest of recent group messages."""
        if not self._check_preference(user.email_notifications, "all_updates"):
            return
        html = self._render(
            "emails/post_digest.html",
            display_name=self._user_display(user),
            group_name=group_name,
            messages_preview=messages_preview,
            group_url=group_url,
        )
        subject = f"Novidades do {group_name}"
        await self._send(user.email, subject, html)

    async def send_badge_earned(
        self,
        user: User,
        badge_name: str,
        badge_emoji: str,
        badge_description: str,
    ) -> None:
        """Notify user that they earned a new badge."""
        profile_url = f"{_frontend_url()}/users/{user.id}"
        html = self._render(
            "emails/badge_earned.html",
            display_name=self._user_display(user),
            badge_name=badge_name,
            badge_emoji=badge_emoji,
            badge_description=badge_description,
            profile_url=profile_url,
        )
        subject = f"Novo badge desbloqueado! {badge_emoji}"
        await self._send(user.email, subject, html)

    async def send_wrapped_ready(
        self,
        user: User,
        group_name: str,
        year: int,
        wrapped_url: str,
    ) -> None:
        """Notify user their annual wrapped is ready."""
        html = self._render(
            "emails/wrapped_ready.html",
            display_name=self._user_display(user),
            group_name=group_name,
            year=year,
            wrapped_url=wrapped_url,
        )
        subject = f"Seu wrapped {year} está pronto!"
        await self._send(user.email, subject, html)


# Singleton instance
email_service = EmailService()


# ── Backward-compatible sync wrappers (callers unchanged) ─────────────────────
#
# Rodam via `asyncio.to_thread` a partir de código async. Antes chamavam
# `_send_sync` direto, pulando o try/except que `_send` tem — então uma
# indisponibilidade do Resend virava exceção no caller. `auth.register_user`
# devolvia 500 depois de já ter commitado a conta, e como login exige
# `email_verified` e reenviar é no-op silencioso, o endereço ficava travado.
#
# Contrato agora: **nunca levantam**. Logam e seguem. Quem precisa saber se
# entregou usa o retorno.


def _send_sync_guarded(
    *,
    kind: str,
    to_email: str,
    template: str,
    subject: str,
    **ctx: object,
) -> str | None:
    """Renderiza e envia, engolindo qualquer falha. Retorna o id do Resend ou None.

    Cobre `_render` também: o Environment usa StrictUndefined, então uma variável
    faltando no template levanta — e isso não pode chegar ao caller.
    """
    try:
        html = email_service._render(template, **ctx)
        email_id = email_service._send_sync(to_email, subject, html)
    except Exception:
        logger.exception("email_send_failed", kind=kind, to=to_email)
        return None
    logger.info(f"{kind}_email_sent", to=to_email, resend_id=email_id)
    return email_id


def send_verification_email(to_email: str, display_name: str, verify_url: str) -> None:
    """Send email verification link — sync wrapper for asyncio.to_thread callers."""
    _send_sync_guarded(
        kind="verification",
        to_email=to_email,
        template="emails/verification.html",
        subject="Bookclub — confirme seu e-mail",
        display_name=display_name,
        verify_url=verify_url,
    )


def send_magic_link_email(to_email: str, display_name: str, magic_url: str) -> None:
    """Envia magic link — síncrona, rodar via asyncio.to_thread."""
    _send_sync_guarded(
        kind="magic_link",
        to_email=to_email,
        template="emails/magic_link.html",
        subject="Bookclub — seu link de acesso",
        display_name=display_name,
        magic_url=magic_url,
    )


def send_email_change_email(to_email: str, display_name: str, confirm_url: str) -> None:
    """Envia link de confirmação de troca de e-mail — síncrona, rodar via asyncio.to_thread."""
    _send_sync_guarded(
        kind="email_change",
        to_email=to_email,
        template="emails/email_change.html",
        subject="Bookclub — confirme seu novo e-mail",
        display_name=display_name,
        confirm_url=confirm_url,
    )


def send_data_export_email(to_email: str, display_name: str, download_url: str) -> None:
    """Envia link de download do export de dados — síncrona, rodar via asyncio.to_thread."""
    _send_sync_guarded(
        kind="data_export",
        to_email=to_email,
        template="emails/data_export.html",
        subject="Bookclub — seus dados estão prontos",
        display_name=display_name,
        download_url=download_url,
    )
