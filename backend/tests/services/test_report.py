"""Testes para o serviço de denúncias de mensagens."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.db.models.report import AUTO_HIDE_THRESHOLD, ReportReason
from app.services.report import ReportError, report_message


def _make_db(
    *,
    member_found: bool = True,
    message_found: bool = True,
    reporter_is_author: bool = False,
    unique_report_count: int = 1,
) -> AsyncMock:
    db = AsyncMock()

    group_id = uuid.uuid4()
    author_id = uuid.uuid4()
    reporter_id = uuid.uuid4() if not reporter_is_author else author_id

    member = MagicMock() if member_found else None
    msg = MagicMock()
    msg.user_id = author_id
    msg.is_hidden = False
    msg_obj = msg if message_found else None

    # Chain scalar_one_or_none returns
    membership_result = MagicMock()
    membership_result.scalar_one_or_none.return_value = member

    msg_result = MagicMock()
    msg_result.scalar_one_or_none.return_value = msg_obj

    count_result = MagicMock()
    count_result.scalar_one.return_value = unique_report_count

    db.execute = AsyncMock(side_effect=[membership_result, msg_result, count_result])
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute_update = AsyncMock()

    return db, group_id, reporter_id


class TestReportMessage:
    @pytest.mark.asyncio
    async def test_raises_404_if_not_member(self) -> None:
        db, group_id, reporter_id = _make_db(member_found=False)
        with pytest.raises(ReportError) as exc_info:
            await report_message(
                db,
                message_id=uuid.uuid4(),
                group_id=group_id,
                reporter_id=reporter_id,
                reason=ReportReason.SPAM,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_404_if_message_not_found(self) -> None:
        db, group_id, reporter_id = _make_db(message_found=False)
        with pytest.raises(ReportError) as exc_info:
            await report_message(
                db,
                message_id=uuid.uuid4(),
                group_id=group_id,
                reporter_id=reporter_id,
                reason=ReportReason.SPAM,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_400_if_reporting_own_message(self) -> None:
        db, group_id, reporter_id = _make_db(reporter_is_author=True)
        with pytest.raises(ReportError) as exc_info:
            await report_message(
                db,
                message_id=uuid.uuid4(),
                group_id=group_id,
                reporter_id=reporter_id,
                reason=ReportReason.SPAM,
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_creates_report_below_threshold(self) -> None:
        db, group_id, reporter_id = _make_db(unique_report_count=AUTO_HIDE_THRESHOLD - 1)
        report = await report_message(
            db,
            message_id=uuid.uuid4(),
            group_id=group_id,
            reporter_id=reporter_id,
            reason=ReportReason.HARASSMENT,
        )
        db.add.assert_called_once()
        # No UPDATE executed to hide the message
        assert db.execute.call_count == 3  # membership + message + count

    @pytest.mark.asyncio
    async def test_auto_hides_message_at_threshold(self) -> None:
        db, group_id, reporter_id = _make_db(unique_report_count=AUTO_HIDE_THRESHOLD)
        # Add a 4th side effect for the UPDATE statement
        update_result = MagicMock()
        db.execute.side_effect = list(db.execute.side_effect) + [update_result]
        await report_message(
            db,
            message_id=uuid.uuid4(),
            group_id=group_id,
            reporter_id=reporter_id,
            reason=ReportReason.SPAM,
        )
        # 4th execute call should be the UPDATE to set is_hidden=True
        assert db.execute.call_count == 4
