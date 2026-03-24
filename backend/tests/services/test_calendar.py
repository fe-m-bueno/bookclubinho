"""Testes unitários para app.services.calendar_service."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock

from app.services.calendar_service import generate_google_calendar_url, generate_ics


def _make_meeting(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.id = overrides.get("id", uuid.uuid4())
    m.title = overrides.get("title", "Discussão Cap 5")
    m.description = overrides.get("description", "Vamos discutir o capítulo 5")
    m.location = overrides.get("location", "Café Central")
    m.virtual_link = overrides.get("virtual_link")
    m.scheduled_at = overrides.get("scheduled_at", datetime(2026, 4, 1, 19, 0, 0, tzinfo=UTC))
    m.duration_minutes = overrides.get("duration_minutes", 60)
    return m


def test_generate_ics_valid_format() -> None:
    meeting = _make_meeting()
    ics = generate_ics(meeting)

    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics
    assert "BEGIN:VEVENT" in ics
    assert "END:VEVENT" in ics
    assert f"UID:{meeting.id}@bookclubinho" in ics
    assert "DTSTART:20260401T190000Z" in ics
    assert "DTEND:20260401T200000Z" in ics
    assert "SUMMARY:Discussão Cap 5" in ics


def test_generate_ics_escapes_special_chars() -> None:
    meeting = _make_meeting(title="Title; with, special\nchars")
    ics = generate_ics(meeting)

    assert "Title\\; with\\, special\\nchars" in ics


def test_generate_ics_uses_virtual_link_as_location_fallback() -> None:
    meeting = _make_meeting(location=None, virtual_link="https://meet.example.com/abc")
    ics = generate_ics(meeting)

    assert "LOCATION:https://meet.example.com/abc" in ics


def test_generate_google_calendar_url_valid() -> None:
    meeting = _make_meeting()
    url = generate_google_calendar_url(meeting)

    assert url.startswith("https://calendar.google.com/calendar/r/eventedit?")
    assert "text=Discuss" in url
    assert "dates=20260401T190000Z/20260401T200000Z" in url
    assert "location=" in url


def test_generate_google_calendar_url_encodes_special_chars() -> None:
    meeting = _make_meeting(title="Discussão & Café")
    url = generate_google_calendar_url(meeting)

    assert "Discuss%C3%A3o" in url
    assert "%26" in url or "&" in url
