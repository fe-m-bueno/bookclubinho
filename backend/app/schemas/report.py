"""Pydantic schemas for message reports."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.db.models.report import ReportReason, ReportStatus


class MessageReportRequest(BaseModel):
    group_id: uuid.UUID
    reason: ReportReason


class MessageReportResponse(BaseModel):
    id: str
    message_id: str
    reason: ReportReason
    status: ReportStatus
    created_at: datetime
