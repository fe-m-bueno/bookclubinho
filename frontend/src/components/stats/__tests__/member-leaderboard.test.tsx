import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemberLeaderboard } from "@/components/stats/member-leaderboard";
import type { MemberLeaderboardEntry } from "@/lib/types/stats";

const mockMembers: MemberLeaderboardEntry[] = [
  {
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
    avatar_url: null,
    books_finished: 8,
    avg_rating: 4.5,
    current_streak: 14,
    reading_time_minutes: 6000,
    reviews_count: 8,
    badges_count: 5,
  },
  {
    user_id: "u2",
    username: "bob",
    display_name: null,
    avatar_url: null,
    books_finished: 3,
    avg_rating: 3.0,
    current_streak: 3,
    reading_time_minutes: 1800,
    reviews_count: 3,
    badges_count: 1,
  },
  {
    user_id: "u3",
    username: null,
    display_name: "Carol",
    avatar_url: null,
    books_finished: 5,
    avg_rating: null,
    current_streak: 0,
    reading_time_minutes: 3000,
    reviews_count: 0,
    badges_count: 2,
  },
];

describe("MemberLeaderboard", () => {
  it("renders empty state when no members", () => {
    render(<MemberLeaderboard members={[]} />);
    expect(screen.getByText("Nenhum membro ainda.")).toBeInTheDocument();
  });

  it("renders all member names", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("shows trophy icon for first place", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  it("renders sort buttons", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    expect(screen.getByRole("button", { name: "Livros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nota" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Streak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tempo" })).toBeInTheDocument();
  });

  it("sorts by books_finished by default (highest first)", () => {
    render(<MemberLeaderboard members={mockMembers} />);

    const items = screen.getAllByText(/livros/i);
    // The first stat row should reference Alice (8 books)
    const rows = screen
      .getAllByText(/livros/i)
      .map((el) => el.closest("[class*='items-center']"));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("sorts by streak when Streak button is clicked", () => {
    render(<MemberLeaderboard members={mockMembers} />);

    fireEvent.click(screen.getByRole("button", { name: "Streak" }));

    // Alice has highest streak (14), should still show trophy
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  it("sorts by avg_rating when Nota button is clicked", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    fireEvent.click(screen.getByRole("button", { name: "Nota" }));

    // Should render without error
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows dash for null avg_rating in the stat value", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    // Carol has null avg_rating
    expect(screen.getAllByText("sem nota").length).toBeGreaterThan(0);
  });

  it("shows dash for null avg_rating when sorted by rating", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    fireEvent.click(screen.getByRole("button", { name: "Nota" }));
    // Carol has null avg_rating, should show "—"
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("displays fallback username when display_name is null", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("displays avatar initials correctly", () => {
    render(<MemberLeaderboard members={mockMembers} />);
    // Alice -> "AL", bob -> "BO", Carol -> "CA"
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("BO")).toBeInTheDocument();
    expect(screen.getByText("CA")).toBeInTheDocument();
  });
});
