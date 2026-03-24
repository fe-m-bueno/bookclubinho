import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { BookResult } from "@/lib/types/book";

import { BookSearchResults } from "../book-search-results";

const books: BookResult[] = [
  {
    book_id: "b1",
    title: "O Hobbit",
    author: "J.R.R. Tolkien",
    cover_url: null,
    slug: "o-hobbit",
    description: null,
    page_count: 310,
  },
  {
    book_id: "b2",
    title: "1984",
    author: "George Orwell",
    cover_url: null,
    slug: "1984",
    description: null,
    page_count: 328,
  },
];

describe("BookSearchResults", () => {
  it("renders book cards with title and author", () => {
    render(
      <BookSearchResults results={books} onSelect={vi.fn()} loading={false} />,
    );

    expect(screen.getByText("O Hobbit")).toBeInTheDocument();
    expect(screen.getByText("J.R.R. Tolkien")).toBeInTheDocument();
    expect(screen.getByText("1984")).toBeInTheDocument();
    expect(screen.getByText("George Orwell")).toBeInTheDocument();
  });

  it("calls onSelect with book when card is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <BookSearchResults results={books} onSelect={onSelect} loading={false} />,
    );

    await user.click(screen.getByRole("button", { name: /selecionar o hobbit/i }));
    expect(onSelect).toHaveBeenCalledWith(books[0]);
  });

  it("shows skeleton cards when loading", () => {
    vi.useFakeTimers();
    const { container } = render(
      <BookSearchResults results={[]} onSelect={vi.fn()} loading={true} />,
    );
    act(() => vi.advanceTimersByTime(250));
    // Skeletons render with animate-pulse
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    vi.useRealTimers();
  });

  it("shows empty message when no results and not loading", () => {
    render(
      <BookSearchResults results={[]} onSelect={vi.fn()} loading={false} />,
    );

    expect(
      screen.getByText(/nenhum livro encontrado/i),
    ).toBeInTheDocument();
  });

  it("renders page count when available", () => {
    render(
      <BookSearchResults results={books} onSelect={vi.fn()} loading={false} />,
    );

    expect(screen.getByText("310 pág.")).toBeInTheDocument();
    expect(screen.getByText("328 pág.")).toBeInTheDocument();
  });
});
