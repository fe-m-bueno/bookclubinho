import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookShelfCard } from "@/components/shelf/book-shelf-card";
import type { ShelfBook } from "@/lib/types/shelf";

// next/image renders as <img> in tests
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

// framer-motion: render children directly
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>(
    "framer-motion",
  );
  return {
    ...actual,
    motion: {
      button: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"button">) => (
        <button {...props}>{children}</button>
      ),
      div: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"div">) => (
        <div {...props}>{children}</div>
      ),
      p: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"p">) => (
        <p {...props}>{children}</p>
      ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useReducedMotion: () => false,
  };
});

const mockBook: ShelfBook = {
  book_title: "O Senhor dos Anéis",
  book_author: "J.R.R. Tolkien",
  book_cover_url: "https://example.com/cover.jpg",
  page_count: 1178,
  genres: ["Fantasia", "Aventura"],
  average_rating: 4.5,
  review_count: 3,
  started_at: "2026-01-01T00:00:00",
  finished_at: "2026-02-28T00:00:00",
  top_oneliners: ["Épico!", "Mudou minha vida"],
};

describe("BookShelfCard", () => {
  it("renders the book cover image", () => {
    render(<BookShelfCard book={mockBook} />);
    expect(screen.getByAltText(/Capa de O Senhor dos Anéis/i)).toBeTruthy();
  });

  it("renders title below cover", () => {
    render(<BookShelfCard book={mockBook} />);
    expect(screen.getAllByText("O Senhor dos Anéis")[0]).toBeInTheDocument();
  });

  it("opens dialog with book details on click", () => {
    render(<BookShelfCard book={mockBook} />);
    const trigger = screen.getByRole("button", { name: /Ver detalhes/i });
    fireEvent.click(trigger);
    expect(screen.getByText("J.R.R. Tolkien")).toBeInTheDocument();
    expect(screen.getByText("1.178 páginas")).toBeInTheDocument();
    expect(screen.getByText("Fantasia")).toBeInTheDocument();
    expect(screen.getByText("Aventura")).toBeInTheDocument();
    expect(screen.getByText("3 reviews")).toBeInTheDocument();
  });

  it("shows one-liners in dialog", () => {
    render(<BookShelfCard book={mockBook} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/i }));
    expect(screen.getByText(/Épico!/)).toBeInTheDocument();
  });

  it("shows BookOpen icon fallback when no cover", () => {
    const noCover: ShelfBook = { ...mockBook, book_cover_url: null };
    render(<BookShelfCard book={noCover} />);
    // No img element should exist (fallback uses BookOpen icon)
    const images = document.querySelectorAll("img");
    expect(images.length).toBe(0);
  });

  it("renders quotes link when groupId is provided", () => {
    render(<BookShelfCard book={mockBook} groupId="grp-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/i }));
    const link = screen.getByRole("link", { name: /quotes/i });
    expect(link).toHaveAttribute("href", "/groups/grp-1/quotes");
  });

  it("does not render quotes link without groupId", () => {
    render(<BookShelfCard book={mockBook} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/i }));
    expect(screen.queryByRole("link", { name: /quotes/i })).toBeNull();
  });
});
