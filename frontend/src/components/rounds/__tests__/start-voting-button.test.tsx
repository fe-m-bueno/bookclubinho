import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NominationSummary } from "@/lib/types/round";

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: vi.fn(() => ({ submit: vi.fn(), loading: false })),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

import { StartVotingButton } from "../start-voting-button";

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

const makeNomination = (id: string): NominationSummary => ({
  id,
  book_id: id,
  book_title: `Livro ${id}`,
  book_author: null,
  book_cover_url: null,
  book_hardcover_slug: null,
  book_page_count: null,
  pitch: null,
  user_id: "u1",
  nominated_at: "2026-01-01T00:00:00Z",
  vote_count: 0,
});

describe("StartVotingButton", () => {
  it("is disabled when there are fewer than 2 nominations", () => {
    renderWithProviders(
      <StartVotingButton
        roundId="r1"
        nominations={[makeNomination("n1")]}
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /iniciar votação/i });
    expect(button).toBeDisabled();
  });

  it("is enabled when there are 2 or more nominations", () => {
    renderWithProviders(
      <StartVotingButton
        roundId="r1"
        nominations={[makeNomination("n1"), makeNomination("n2")]}
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /iniciar votação/i });
    expect(button).not.toBeDisabled();
  });

  it("is enabled with 3 nominations", () => {
    renderWithProviders(
      <StartVotingButton
        roundId="r1"
        nominations={[
          makeNomination("n1"),
          makeNomination("n2"),
          makeNomination("n3"),
        ]}
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /iniciar votação/i });
    expect(button).not.toBeDisabled();
  });

  it("is disabled with 0 nominations", () => {
    renderWithProviders(
      <StartVotingButton
        roundId="r1"
        nominations={[]}
        onSuccess={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /iniciar votação/i });
    expect(button).toBeDisabled();
  });
});
