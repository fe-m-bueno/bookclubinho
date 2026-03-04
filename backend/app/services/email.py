"""Email service — sends transactional emails via Resend."""

from __future__ import annotations

import resend
import structlog

from app.core.config import settings

logger = structlog.get_logger(__name__)


def send_verification_email(to_email: str, display_name: str, verify_url: str) -> None:
    """Send email verification link to a newly registered user.

    Uses Resend API (sync call — run in thread for async contexts).
    """
    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Olá, {display_name}!</h2>
      <p>Bem-vindo ao Bookclub. Confirme seu e-mail clicando no botão abaixo:</p>
      <a href="{verify_url}"
         style="display:inline-block;padding:12px 24px;background:#c2410c;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:bold;">
        Verificar e-mail
      </a>
      <p style="margin-top:24px;color:#666;font-size:13px;">
        O link expira em 24 horas. Se você não criou uma conta, ignore este e-mail.
      </p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Bookclub — confirme seu e-mail",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info("verification_email_sent", to=to_email, resend_id=response.get("id"))


def send_magic_link_email(to_email: str, display_name: str, magic_url: str) -> None:
    """Envia magic link — síncrona, rodar via asyncio.to_thread."""
    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Olá, {display_name}!</h2>
      <p>Clique no botão abaixo para entrar no Bookclub.
         O link é válido por 15 minutos e só pode ser usado uma vez:</p>
      <a href="{magic_url}"
         style="display:inline-block;padding:12px 24px;background:#c2410c;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:bold;">
        Entrar no Bookclub
      </a>
      <p style="margin-top:24px;color:#666;font-size:13px;">
        Se você não solicitou este link, ignore este e-mail.
      </p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Bookclub — seu link de acesso",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info("magic_link_email_sent", to=to_email, resend_id=response.get("id"))
