"""Calendar service — .ics generation and Google Calendar URL."""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING
from urllib.parse import quote

if TYPE_CHECKING:
    from app.db.models.meeting import Meeting


def generate_ics(meeting: Meeting) -> str:
    """Generate a VCALENDAR string for a single meeting event."""
    dtstart = meeting.scheduled_at.strftime("%Y%m%dT%H%M%SZ")
    dtend = (
        meeting.scheduled_at + timedelta(minutes=meeting.duration_minutes)
    ).strftime("%Y%m%dT%H%M%SZ")

    location = meeting.location or meeting.virtual_link or ""
    description = meeting.description or ""

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Bookclubinho//Meetings//PT-BR",
        "BEGIN:VEVENT",
        f"UID:{meeting.id}@bookclubinho",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{_ical_escape(meeting.title)}",
        f"DESCRIPTION:{_ical_escape(description)}",
        f"LOCATION:{_ical_escape(location)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines)


def generate_google_calendar_url(meeting: Meeting) -> str:
    """Generate a Google Calendar event creation URL."""
    dtstart = meeting.scheduled_at.strftime("%Y%m%dT%H%M%SZ")
    dtend = (
        meeting.scheduled_at + timedelta(minutes=meeting.duration_minutes)
    ).strftime("%Y%m%dT%H%M%SZ")

    location = meeting.location or meeting.virtual_link or ""
    description = meeting.description or ""

    params = (
        f"action=TEMPLATE"
        f"&text={quote(meeting.title)}"
        f"&dates={dtstart}/{dtend}"
        f"&details={quote(description)}"
        f"&location={quote(location)}"
    )
    return f"https://calendar.google.com/calendar/r/eventedit?{params}"


def _ical_escape(value: str) -> str:
    """Escape special characters for iCalendar text fields."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )
