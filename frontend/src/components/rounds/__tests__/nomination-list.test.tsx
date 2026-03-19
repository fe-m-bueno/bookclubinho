import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { NominationSummary } from "@/lib/types/round";
import type { MemberSummary } from "@/lib/types/group";

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: vi.fn(() => ({ submit: vi.fn(), loading: false })),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

import { NominationList } from "../nomination-list";

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
    joined_at: "2026-01-02T00:00:00Z",
  },
];

const nominations: NominationSummary[] = [
  {
    id: "n1",
    book_id: "b1",
    book_title: "O Hobbit",
    book_author: "J.R.R. Tolkien",
    book_cover_url: null,
    book_hardcover_slug: "o-hobbit",
    book_page_count: 310,
    pitch: "Clássico imperdível!",
    user_id: "u1",
    nominated_at: "2026-01-01T00:00:00Z",
    vote_count: 0,
  },
  {
    id: "n2",
    book_id: "b2",
    book_title: "1984",
    book_author: "George Orwell",
    book_cover_url: null,
    book_hardcover_slug: "1984",
    book_page_count: 328,
    pitch: null,
    user_id: "u2",
    nominated_at: "2026-01-01T00:00:00Z",
    vote_count: 0,
  },
];

describe("NominationList", () => {
  it("shows empty state when no nominations", () => {
    render(
      <NominationList
        nominations={[]}
        members={members}
        currentUserId="u1"
        roundId="r1"
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText("Nenhuma indicação ainda")).toBeInTheDocument();
    expect(screen.getByText("Indicações (0)")).toBeInTheDocument();
  });

  it("renders nomination cards with correct count", () => {
    render(
      <NominationList
        nominations={nominations}
        members={members}
        currentUserId="u1"
        roundId="r1"
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText("Indicações (2)")).toBeInTheDocument();
    expect(screen.getByText("O Hobbit")).toBeInTheDocument();
    expect(screen.getByText("1984")).toBeInTheDocument();
  });

  it("shows remove button only for own nominations", () => {
    render(
      <NominationList
        nominations={nominations}
        members={members}
        currentUserId="u1"
        roundId="r1"
        onRemoved={vi.fn()}
      />,
    );

    // u1 nominated "O Hobbit" — should have remove button
    const removeButtons = screen.getAllByRole("button", {
      name: /remover indicação/i,
    });
    expect(removeButtons).toHaveLength(1);
  });

  it("shows nominator name resolved from members", () => {
    render(
      <NominationList
        nominations={nominations}
        members={members}
        currentUserId="u1"
        roundId="r1"
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
  });
});
