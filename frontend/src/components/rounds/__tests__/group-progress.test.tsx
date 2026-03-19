import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { MemberProgressSummary } from "@/lib/types/round";
import { GroupProgress } from "../group-progress";

function makeProgress(overrides: Partial<MemberProgressSummary> = {}): MemberProgressSummary {
  return {
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar_url: null,
    streak_current: 0,
    current_page: null,
    total_pages: null,
    percentage: 0,
    is_finished: false,
    note: null,
    updated_at: null,
    ...overrides,
  };
}

const defaultProps = {
  currentUserId: "u1",
  roundStartedAt: null,
  bookPageCount: null,
  loading: false,
};

describe("GroupProgress", () => {
  it("renders section title", () => {
    render(<GroupProgress {...defaultProps} progress={[makeProgress()]} />);
    expect(screen.getByText("Progresso do Grupo")).toBeInTheDocument();
  });

  it("shows empty state when all percentages are zero", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ percentage: 0 }), makeProgress({ user_id: "u2", percentage: 0 })]}
      />,
    );
    expect(screen.getByText("Ninguém começou ainda")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    const { container } = render(
      <GroupProgress {...defaultProps} progress={null} loading={true} />,
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders display_name when available", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ display_name: "Alice Silva", percentage: 50 })]}
      />,
    );
    expect(screen.getByText("Alice Silva")).toBeInTheDocument();
  });

  it("falls back to username when display_name is null", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ display_name: null, username: "alice_user", percentage: 50 })]}
      />,
    );
    expect(screen.getByText("alice_user")).toBeInTheDocument();
  });

  it("falls back to 'Membro' when both display_name and username are null", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ display_name: null, username: null, percentage: 50 })]}
      />,
    );
    expect(screen.getByText("Membro")).toBeInTheDocument();
  });

  it("shows streak badge when streak_current > 0", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ streak_current: 7, percentage: 50 })]}
      />,
    );
    expect(screen.getByText("🔥 7")).toBeInTheDocument();
  });

  it("does not show streak badge when streak_current is 0", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ streak_current: 0, percentage: 50 })]}
      />,
    );
    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
  });

  it("shows finished label with days when roundStartedAt and updated_at available", () => {
    render(
      <GroupProgress
        {...defaultProps}
        roundStartedAt="2026-01-01T00:00:00Z"
        progress={[
          makeProgress({
            is_finished: true,
            percentage: 100,
            updated_at: "2026-01-08T00:00:00Z",
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Terminou em 7 dias/)).toBeInTheDocument();
  });

  it("shows page/total label when current_page and bookPageCount are set", () => {
    render(
      <GroupProgress
        {...defaultProps}
        bookPageCount={300}
        progress={[makeProgress({ current_page: 150, percentage: 50 })]}
      />,
    );
    expect(screen.getByText("p. 150/300")).toBeInTheDocument();
  });

  it("shows percentage label when no page info", () => {
    render(
      <GroupProgress
        {...defaultProps}
        progress={[makeProgress({ percentage: 42 })]}
      />,
    );
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("shows note for own progress without blur", () => {
    render(
      <GroupProgress
        {...defaultProps}
        currentUserId="u1"
        progress={[makeProgress({ user_id: "u1", percentage: 30, note: "Ótimo livro" })]}
      />,
    );
    expect(screen.getByText(/Ótimo livro/)).toBeInTheDocument();
  });

  it("shows blur overlay for note of member ahead of current user", () => {
    const progress = [
      makeProgress({ user_id: "u1", percentage: 20, note: null }),
      makeProgress({ user_id: "u2", percentage: 80, note: "Spoiler aqui" }),
    ];
    render(
      <GroupProgress
        {...defaultProps}
        currentUserId="u1"
        progress={progress}
      />,
    );
    expect(screen.getByText("Toque para revelar")).toBeInTheDocument();
  });

  it("reveals note after clicking 'Toque para revelar'", () => {
    const progress = [
      makeProgress({ user_id: "u1", percentage: 20, note: null }),
      makeProgress({ user_id: "u2", percentage: 80, note: "Spoiler aqui" }),
    ];
    render(
      <GroupProgress
        {...defaultProps}
        currentUserId="u1"
        progress={progress}
      />,
    );
    fireEvent.click(screen.getByLabelText("Revelar nota"));
    expect(screen.getByText(/Spoiler aqui/)).toBeInTheDocument();
    expect(screen.queryByText("Toque para revelar")).not.toBeInTheDocument();
  });
});
