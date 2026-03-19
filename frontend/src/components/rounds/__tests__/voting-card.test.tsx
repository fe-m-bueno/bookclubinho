import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { NominationSummary } from "@/lib/types/round";
import { VotingCard } from "../voting-card";

const nomination: NominationSummary = {
  id: "n1",
  book_id: "b1",
  book_title: "Dom Casmurro",
  book_author: "Machado de Assis",
  book_cover_url: null,
  book_hardcover_slug: null,
  book_page_count: 256,
  pitch: "Um clássico da literatura brasileira.",
  user_id: "u1",
  nominated_at: "2026-01-01T00:00:00Z",
  vote_count: 3,
};

const defaultProps = {
  nomination,
  nominatorName: "Alice",
  nominatorAvatarUrl: null,
  isSelected: false,
  isRevealed: false,
  isWinner: false,
  disabled: false,
  onVote: vi.fn(),
};

describe("VotingCard", () => {
  it("renders book title and author", () => {
    render(<VotingCard {...defaultProps} />);
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.getByText("Machado de Assis")).toBeInTheDocument();
  });

  it("renders nominator name", () => {
    render(<VotingCard {...defaultProps} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("renders pitch when present", () => {
    render(<VotingCard {...defaultProps} />);
    expect(
      screen.getByText(/Um clássico da literatura brasileira/),
    ).toBeInTheDocument();
  });

  it("calls onVote with nomination id when clicked", () => {
    const onVote = vi.fn();
    render(<VotingCard {...defaultProps} onVote={onVote} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onVote).toHaveBeenCalledWith("n1");
  });

  it("does not call onVote when disabled", () => {
    const onVote = vi.fn();
    render(<VotingCard {...defaultProps} onVote={onVote} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onVote).not.toHaveBeenCalled();
  });

  it("shows 'Seu voto' badge when selected and not revealed", () => {
    render(<VotingCard {...defaultProps} isSelected />);
    expect(screen.getByText("Seu voto")).toBeInTheDocument();
  });

  it("does not show 'Seu voto' badge when not selected", () => {
    render(<VotingCard {...defaultProps} />);
    expect(screen.queryByText("Seu voto")).not.toBeInTheDocument();
  });

  it("shows winner badge when revealed and isWinner", () => {
    render(<VotingCard {...defaultProps} isRevealed isWinner />);
    expect(screen.getByText("Vencedor")).toBeInTheDocument();
  });

  it("does not show winner badge when not winner", () => {
    render(<VotingCard {...defaultProps} isRevealed />);
    expect(screen.queryByText("Vencedor")).not.toBeInTheDocument();
  });

  it("shows vote count when revealed", () => {
    render(<VotingCard {...defaultProps} isRevealed />);
    expect(screen.getByText("3 votos")).toBeInTheDocument();
  });

  it("does not show vote count when not revealed", () => {
    render(<VotingCard {...defaultProps} />);
    expect(screen.queryByText(/votos/)).not.toBeInTheDocument();
  });

  it("shows singular 'voto' for 1 vote", () => {
    render(
      <VotingCard
        {...defaultProps}
        nomination={{ ...nomination, vote_count: 1 }}
        isRevealed
      />,
    );
    expect(screen.getByText("1 voto")).toBeInTheDocument();
  });
});
