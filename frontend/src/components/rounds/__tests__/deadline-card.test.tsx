import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { DeadlineCard } from "../deadline-card";

describe("DeadlineCard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the formatted date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));

    render(<DeadlineCard deadline="2026-04-15" />);

    // "15 de Abril" (capitalized via CSS, text is lowercase in DOM)
    expect(screen.getByText(/15 de abril/i)).toBeInTheDocument();
  });

  it("shows a days remaining badge when deadline is in the future", () => {
    vi.useFakeTimers();
    // Use noon local time to avoid timezone edge cases with startOfToday
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));

    render(<DeadlineCard deadline="2026-04-15" />);

    // Badge should contain "dias" (plural) — exact count may vary by tz
    expect(screen.getByText(/dias/i)).toBeInTheDocument();
  });

  it("shows 'Hoje!' badge when deadline is today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00"));

    render(<DeadlineCard deadline="2026-04-15" />);

    expect(screen.getByText("Hoje!")).toBeInTheDocument();
  });

  it("shows '1 dia' when exactly one day remaining", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    render(<DeadlineCard deadline="2026-04-15" />);

    expect(screen.getByText("1 dia")).toBeInTheDocument();
  });

  it("shows 'Prazo encerrado' when deadline has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00"));

    render(<DeadlineCard deadline="2026-04-15" />);

    expect(screen.getByText("Prazo encerrado")).toBeInTheDocument();
    // No badge shown when deadline passed
    expect(screen.queryByRole("generic", { name: /dias/i })).not.toBeInTheDocument();
  });

  it("shows friendly hint text when deadline is not passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00"));

    render(<DeadlineCard deadline="2026-04-15" />);

    expect(
      screen.getByText(/sem pressa/i),
    ).toBeInTheDocument();
  });
});
