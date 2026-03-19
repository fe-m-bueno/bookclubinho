import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { MemberSummary } from "@/lib/types/group";
import type { MemberProgressSummary } from "@/lib/types/round";
import { GroupProgress } from "../group-progress";

const members: MemberSummary[] = [
  {
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar_url: null,
    role: "admin",
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    user_id: "u2",
    username: "bob",
    display_name: null,
    avatar_url: null,
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
  },
];

describe("GroupProgress", () => {
  it("renders section title", () => {
    render(<GroupProgress members={members} progress={[]} loading={false} />);
    expect(screen.getByText("Progresso do Grupo")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    const { container } = render(
      <GroupProgress members={members} progress={null} loading={true} />,
    );
    // 3 skeleton rows × 4 skeleton elements each = 12
    expect(container.querySelectorAll(".animate-pulse").length).toBe(12);
  });

  it("renders member names when progress is loaded", () => {
    const progress: MemberProgressSummary[] = [
      {
        user_id: "u1",
        current_page: 50,
        percentage: 25,
        is_finished: false,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    render(<GroupProgress members={members} progress={progress} loading={false} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("shows 'Terminou!' badge for finished members", () => {
    const progress: MemberProgressSummary[] = [
      {
        user_id: "u1",
        current_page: null,
        percentage: 100,
        is_finished: true,
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];

    render(<GroupProgress members={members} progress={progress} loading={false} />);

    expect(screen.getByText("Terminou!")).toBeInTheDocument();
  });

  it("shows percentage for non-finished members", () => {
    const progress: MemberProgressSummary[] = [
      {
        user_id: "u1",
        current_page: 100,
        percentage: 50,
        is_finished: false,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    render(<GroupProgress members={members} progress={progress} loading={false} />);

    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("falls back to username when display_name is null", () => {
    render(<GroupProgress members={members} progress={[]} loading={false} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });
});
