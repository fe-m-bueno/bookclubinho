import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimestampSeparator } from "../timestamp-separator";

// ---------------------------------------------------------------------------
// Helpers — produce ISO strings relative to "now"
// ---------------------------------------------------------------------------

function todayAt(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function yesterdayAt(hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAgoAt(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TimestampSeparator", () => {
  it("renders a separator role element", () => {
    render(<TimestampSeparator timestamp={todayAt(10, 0)} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("formats today's date as 'Hoje HH:mm'", () => {
    const timestamp = todayAt(9, 5);
    render(<TimestampSeparator timestamp={timestamp} />);

    // The rendered label should start with "Hoje"
    const label = screen.getByRole("separator").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Hoje \d{2}:\d{2}$/);
    expect(label).toContain("Hoje");
  });

  it("formats yesterday's date as 'Ontem HH:mm'", () => {
    const timestamp = yesterdayAt(15, 30);
    render(<TimestampSeparator timestamp={timestamp} />);

    const label = screen.getByRole("separator").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Ontem \d{2}:\d{2}$/);
    expect(label).toContain("Ontem");
  });

  it("formats older dates as 'd MMM HH:mm' (no 'Hoje' or 'Ontem')", () => {
    const timestamp = daysAgoAt(5, 8, 45);
    render(<TimestampSeparator timestamp={timestamp} />);

    const label = screen.getByRole("separator").getAttribute("aria-label") ?? "";
    expect(label).not.toContain("Hoje");
    expect(label).not.toContain("Ontem");
    // Should contain a digit-month-time pattern, e.g. "14 jan 08:45"
    expect(label).toMatch(/\d+ \w+ \d{2}:\d{2}/);
  });

  it("renders the label text visibly in a span", () => {
    const timestamp = todayAt(12, 0);
    render(<TimestampSeparator timestamp={timestamp} />);

    const span = document.querySelector("span.text-xs");
    expect(span).toBeInTheDocument();
    expect(span?.textContent).toMatch(/^Hoje \d{2}:\d{2}$/);
  });

  it("exposes the formatted label in aria-label", () => {
    const timestamp = yesterdayAt(20, 0);
    render(<TimestampSeparator timestamp={timestamp} />);

    const separator = screen.getByRole("separator");
    const label = separator.getAttribute("aria-label") ?? "";
    // The visible span text and aria-label must match
    const span = document.querySelector("span.text-xs");
    expect(label).toBe(span?.textContent);
  });

  it("zero-pads single-digit minutes correctly", () => {
    const timestamp = todayAt(8, 5);
    render(<TimestampSeparator timestamp={timestamp} />);

    const label = screen.getByRole("separator").getAttribute("aria-label") ?? "";
    // HH:mm must have zero-padded minutes, e.g. "08:05" not "8:5"
    expect(label).toMatch(/\d{2}:0\d/);
  });
});
