import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RoundDetailResponse } from "@/lib/types/round";
import type { GroupDetailResponse } from "@/lib/types/group";

const mockSubmit = vi.fn();

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: vi.fn(() => ({ submit: mockSubmit, loading: false })),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

import { RoundVotingPhase } from "../round-voting-phase";

const adminGroup: GroupDetailResponse = {
  id: "g1",
  name: "Clube",
  description: null,
  photo_url: null,
  invite_code: "CODE123",
  max_members: 8,
  member_count: 2,
  members: [
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
      display_name: "Bob",
      avatar_url: null,
      role: "member",
      joined_at: "2026-01-01T00:00:00Z",
    },
  ],
  current_user_id: "u1",
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

const memberGroup: GroupDetailResponse = {
  ...adminGroup,
  invite_code: null,
  current_user_id: "u2",
};

const votingRound: RoundDetailResponse = {
  id: "r1",
  round_number: 1,
  book_id: null,
  book_title: null,
  book_author: null,
  book_cover_url: null,
  book_page_count: null,
  status: "voting",
  deadline: null,
  started_at: "2026-01-01T00:00:00Z",
  finished_at: null,
  created_at: "2026-01-01T00:00:00Z",
  tiebreak_info: null,
  nominations: [
    {
      id: "n1",
      book_id: "b1",
      book_title: "Dom Casmurro",
      book_author: "Machado de Assis",
      book_cover_url: null,
      book_hardcover_slug: null,
      book_page_count: null,
      pitch: null,
      user_id: "u1",
      nominated_at: "2026-01-01T00:00:00Z",
      vote_count: 2,
    },
    {
      id: "n2",
      book_id: "b2",
      book_title: "Memórias Póstumas",
      book_author: "Machado de Assis",
      book_cover_url: null,
      book_hardcover_slug: null,
      book_page_count: null,
      pitch: null,
      user_id: "u2",
      nominated_at: "2026-01-01T00:00:00Z",
      vote_count: 1,
    },
  ],
};

describe("RoundVotingPhase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders voting cards for each nomination", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.getByText("Memórias Póstumas")).toBeInTheDocument();
  });

  it("shows 'Escolha seu livro' heading", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(screen.getByText("Escolha seu livro")).toBeInTheDocument();
  });

  it("vote counts are hidden during voting", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(screen.queryByText(/votos/)).not.toBeInTheDocument();
  });

  it("admin sees finalize button", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin

        group={adminGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /encerrar votação/i }),
    ).toBeInTheDocument();
  });

  it("member does not see finalize button", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /encerrar votação/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking a card calls castVote with nomination_id", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    const [firstCard] = screen.getAllByRole("button");
    fireEvent.click(firstCard);
    expect(mockSubmit).toHaveBeenCalledWith(
      JSON.stringify({ nomination_id: "n1" }),
    );
  });

  it("shows status badge", () => {
    render(
      <RoundVotingPhase
        round={votingRound}
        isAdmin={false}

        group={memberGroup}
        onFinalized={vi.fn()}
      />,
    );
    expect(screen.getByText("Fase de votação")).toBeInTheDocument();
  });
});
