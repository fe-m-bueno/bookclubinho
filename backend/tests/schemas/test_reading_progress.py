"""Testes unitários para app.schemas.reading_progress."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.reading_progress import (
    GroupProgressResponse,
    MemberProgressSummary,
    ProgressResponse,
    ProgressUpdateRequest,
)

# ── ProgressUpdateRequest ─────────────────────────────────────────────────────


def test_progress_update_request_with_page() -> None:
    req = ProgressUpdateRequest(current_page=50)
    assert req.current_page == 50
    assert req.percentage is None


def test_progress_update_request_with_percentage() -> None:
    req = ProgressUpdateRequest(percentage=75.0)
    assert req.current_page is None
    assert req.percentage == 75.0


def test_progress_update_request_with_both() -> None:
    req = ProgressUpdateRequest(current_page=100, percentage=50.0)
    assert req.current_page == 100
    assert req.percentage == 50.0


def test_progress_update_request_neither_field_raises() -> None:
    with pytest.raises(ValidationError) as exc_info:
        ProgressUpdateRequest()
    assert "página" in str(exc_info.value) or "porcentagem" in str(exc_info.value)


def test_progress_update_request_negative_page_raises() -> None:
    with pytest.raises(ValidationError):
        ProgressUpdateRequest(current_page=-1)


def test_progress_update_request_percentage_below_zero_raises() -> None:
    with pytest.raises(ValidationError):
        ProgressUpdateRequest(percentage=-0.1)


def test_progress_update_request_percentage_above_100_raises() -> None:
    with pytest.raises(ValidationError):
        ProgressUpdateRequest(percentage=100.1)


def test_progress_update_request_percentage_at_boundary() -> None:
    req = ProgressUpdateRequest(percentage=100.0)
    assert req.percentage == 100.0

    req_zero = ProgressUpdateRequest(percentage=0.0)
    assert req_zero.percentage == 0.0


def test_progress_update_request_page_zero_is_valid() -> None:
    req = ProgressUpdateRequest(current_page=0)
    assert req.current_page == 0


# ── ProgressResponse ──────────────────────────────────────────────────────────


def test_progress_response_is_finished_false() -> None:
    resp = ProgressResponse(
        id="abc",
        user_id="user-1",
        current_page=50,
        percentage=50.0,
        is_finished=False,
        created_at=datetime.now(UTC),
    )
    assert resp.is_finished is False


def test_progress_response_is_finished_true() -> None:
    resp = ProgressResponse(
        id="abc",
        user_id="user-1",
        current_page=300,
        percentage=100.0,
        is_finished=True,
        created_at=datetime.now(UTC),
    )
    assert resp.is_finished is True


# ── MemberProgressSummary ────────────────────────────────────────────────────


def test_member_progress_summary_no_progress() -> None:
    summary = MemberProgressSummary(
        user_id="user-1",
        current_page=None,
        percentage=0.0,
        is_finished=False,
        updated_at=None,
    )
    assert summary.user_id == "user-1"
    assert summary.updated_at is None
    assert summary.is_finished is False


def test_member_progress_summary_finished() -> None:
    summary = MemberProgressSummary(
        user_id="user-2",
        current_page=300,
        percentage=100.0,
        is_finished=True,
        updated_at=datetime.now(UTC),
    )
    assert summary.is_finished is True
    assert summary.percentage == 100.0


# ── GroupProgressResponse ─────────────────────────────────────────────────────


def test_group_progress_response_empty() -> None:
    resp = GroupProgressResponse(progress=[])
    assert resp.progress == []


def test_group_progress_response_multiple_members() -> None:
    now = datetime.now(UTC)
    resp = GroupProgressResponse(
        progress=[
            MemberProgressSummary(
                user_id="user-1",
                current_page=100,
                percentage=50.0,
                is_finished=False,
                updated_at=now,
            ),
            MemberProgressSummary(
                user_id="user-2",
                current_page=None,
                percentage=0.0,
                is_finished=False,
                updated_at=None,
            ),
        ]
    )
    assert len(resp.progress) == 2
    assert resp.progress[0].user_id == "user-1"
    assert resp.progress[1].user_id == "user-2"
