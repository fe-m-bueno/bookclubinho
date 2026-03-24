"""Message report service — abuse prevention."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import func, select, update

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.db.models.message import GroupMessage
from app.db.models.report import AUTO_HIDE_THRESHOLD, MessageReport, ReportReason
from app.services.chat import ChatError, _check_membership

logger = structlog.get_logger(__name__)


class ReportError(ServiceError):
    """Raised when a report operation fails."""


async def report_message(
    db: AsyncSession,
    *,
    message_id: uuid.UUID,
    group_id: uuid.UUID,
    reporter_id: uuid.UUID,
    reason: ReportReason,
) -> MessageReport:
    """File a report against a chat message.

    - Verifies reporter is a member of the group.
    - Verifies the message exists in the group and is not deleted.
    - Enforces one report per reporter per message (unique constraint).
    - Auto-hides the message when AUTO_HIDE_THRESHOLD unique reports are reached.
    """
    try:
        await _check_membership(db, group_id, reporter_id)
    except ChatError as exc:
        raise ReportError(str(exc), status_code=exc.status_code) from exc

    # Verify message exists in this group
    msg_result = await db.execute(
        select(GroupMessage).where(
            GroupMessage.id == message_id,
            GroupMessage.group_id == group_id,
            GroupMessage.is_deleted.is_(False),
        )
    )
    msg = msg_result.scalar_one_or_none()
    if msg is None:
        raise ReportError("Mensagem não encontrada.", status_code=404)

    # Cannot report own message
    if msg.user_id == reporter_id:
        raise ReportError("Você não pode denunciar a própria mensagem.", status_code=400)

    # Create report (unique constraint handles duplicates at DB level)
    report = MessageReport(
        message_id=message_id,
        group_id=group_id,
        reporter_id=reporter_id,
        reported_user_id=msg.user_id,
        reason=reason,
    )
    db.add(report)
    await db.flush()

    # Count unique reporters for this message
    count_result = await db.execute(
        select(func.count()).select_from(MessageReport).where(MessageReport.message_id == message_id)
    )
    unique_reporters = count_result.scalar_one()

    # Auto-hide after threshold is reached
    if unique_reporters >= AUTO_HIDE_THRESHOLD and not msg.is_hidden:
        await db.execute(update(GroupMessage).where(GroupMessage.id == message_id).values(is_hidden=True))
        logger.info(
            "message_auto_hidden",
            message_id=str(message_id),
            group_id=str(group_id),
            report_count=unique_reporters,
        )

    logger.info(
        "message_reported",
        message_id=str(message_id),
        group_id=str(group_id),
        reporter_id=str(reporter_id),
        reason=reason,
    )
    return report
