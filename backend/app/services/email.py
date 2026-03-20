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


def send_email_change_email(to_email: str, display_name: str, confirm_url: str) -> None:
    """Envia link de confirmação de troca de e-mail — síncrona, rodar via asyncio.to_thread."""
    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Olá, {display_name}!</h2>
      <p>Recebemos uma solicitação para alterar o e-mail da sua conta no Bookclub.
         Clique no botão abaixo para confirmar o novo e-mail:</p>
      <a href="{confirm_url}"
         style="display:inline-block;padding:12px 24px;background:#c2410c;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:bold;">
        Confirmar novo e-mail
      </a>
      <p style="margin-top:24px;color:#666;font-size:13px;">
        O link expira em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.
      </p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Bookclub — confirme seu novo e-mail",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info("email_change_email_sent", to=to_email, resend_id=response.get("id"))


def send_data_export_email(
    to_email: str, display_name: str, download_url: str
) -> None:
    """Envia link de download do export de dados — síncrona, rodar via asyncio.to_thread."""
    resend.api_key = settings.RESEND_API_KEY

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Olá, {display_name}!</h2>
      <p>Sua exportação de dados do Bookclub está pronta.
         Clique no botão abaixo para baixar:</p>
      <a href="{download_url}"
         style="display:inline-block;padding:12px 24px;background:#c2410c;color:#fff;
                border-radius:6px;text-decoration:none;font-weight:bold;">
        Baixar meus dados
      </a>
      <p style="margin-top:24px;color:#666;font-size:13px;">
        O link expira em 24 horas.
        Se você não solicitou esta exportação, ignore este e-mail.
      </p>
    </div>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": "Bookclub — seus dados estão prontos",
        "html": html_body,
    }

    response = resend.Emails.send(params)
    logger.info("data_export_email_sent", to=to_email, resend_id=response.get("id"))
