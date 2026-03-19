import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NominationSummary } from "@/lib/types/round";
import type { MemberSummary } from "@/lib/types/group";

vi.mock("react-confetti", () => ({
  default: () => null,
}));

vi.mock("@/hooks/use-window-size", () => ({
  useWindowSize: () => ({ width: 1024, height: 768 }),
}));

import { VotingReveal } from "../voting-reveal";

const nominations: NominationSummary[] = [
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
    vote_count: 3,
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
];

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
    display_name: "Bob",
    avatar_url: null,
    role: "member",
    joined_at: "2026-01-01T00:00:00Z",
  },
];

describe("VotingReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders all nominations", () => {
    render(
      <VotingReveal
        nominations={nominations}
        winnerNominationId="n1"
        wasTiebreak={false}
        members={members}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.getByText("Memórias Póstumas")).toBeInTheDocument();
  });

  it("shows 'O grupo decidiu!' when not tiebreak", async () => {
    render(
      <VotingReveal
        nominations={nominations}
        winnerNominationId="n1"
        wasTiebreak={false}
        members={members}
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByText("O grupo decidiu!")).toBeInTheDocument();
  });

  it("shows 'O destino escolheu!' when tiebreak", async () => {
    render(
      <VotingReveal
        nominations={nominations}
        winnerNominationId="n1"
        wasTiebreak
        members={members}
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByText("O destino escolheu!")).toBeInTheDocument();
    expect(
      screen.getByText(/Houve empate/),
    ).toBeInTheDocument();
  });

  it("calls onComplete when continue button is clicked", async () => {
    const onComplete = vi.fn();
    render(
      <VotingReveal
        nominations={nominations}
        winnerNominationId="n1"
        wasTiebreak={false}
        members={members}
        onComplete={onComplete}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    const continueButton = screen.getByRole("button", { name: /continuar/i });
    continueButton.click();
    expect(onComplete).toHaveBeenCalled();
  });

  it("shows vote counts after reveal step", async () => {
    render(
      <VotingReveal
        nominations={nominations}
        winnerNominationId="n1"
        wasTiebreak={false}
        members={members}
        onComplete={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText("3 votos")).toBeInTheDocument();
    expect(screen.getByText("1 voto")).toBeInTheDocument();
  });
});
