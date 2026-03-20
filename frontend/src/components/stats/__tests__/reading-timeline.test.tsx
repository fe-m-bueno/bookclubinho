import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingTimeline } from "@/components/stats/reading-timeline";
import type { ShelfBook } from "@/lib/types/shelf";

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const makeBook = (overrides: Partial<ShelfBook> = {}): ShelfBook => ({
  book_title: "Livro Padrão",
  book_author: "Autor",
  book_cover_url: null,
  page_count: 300,
  genres: [],
  average_rating: null,
  review_count: 0,
  started_at: null,
  finished_at: "2026-01-15T00:00:00Z",
  top_oneliners: [],
  ...overrides,
});

describe("ReadingTimeline", () => {
  it("shows empty state when no books provided", () => {
    render(<ReadingTimeline books={[]} />);
    expect(
      screen.getByText("Nenhum livro finalizado ainda."),
    ).toBeInTheDocument();
  });

  it("shows empty state when no books have finished_at", () => {
    render(
      <ReadingTimeline
        books={[makeBook({ finished_at: null })]}
      />,
    );
    expect(
      screen.getByText("Nenhum livro finalizado ainda."),
    ).toBeInTheDocument();
  });

  it("renders the card title", () => {
    render(<ReadingTimeline books={[makeBook()]} />);
    expect(screen.getByText("Linha do tempo")).toBeInTheDocument();
  });

  it("renders finished books", () => {
    render(
      <ReadingTimeline
        books={[
          makeBook({ book_title: "Livro A", finished_at: "2026-01-01T00:00:00Z" }),
          makeBook({ book_title: "Livro B", finished_at: "2026-02-01T00:00:00Z" }),
        ]}
      />,
    );
    expect(screen.getByText("Livro A")).toBeInTheDocument();
    expect(screen.getByText("Livro B")).toBeInTheDocument();
  });

  it("filters out books without finished_at", () => {
    render(
      <ReadingTimeline
        books={[
          makeBook({ book_title: "Terminado", finished_at: "2026-01-01T00:00:00Z" }),
          makeBook({ book_title: "Não terminado", finished_at: null }),
        ]}
      />,
    );
    expect(screen.getByText("Terminado")).toBeInTheDocument();
    expect(screen.queryByText("Não terminado")).not.toBeInTheDocument();
  });

  it("sorts books by finished_at ascending", () => {
    render(
      <ReadingTimeline
        books={[
          makeBook({ book_title: "Segundo", finished_at: "2026-03-01T00:00:00Z" }),
          makeBook({ book_title: "Primeiro", finished_at: "2026-01-01T00:00:00Z" }),
        ]}
      />,
    );

    const titles = screen.getAllByText(/Primeiro|Segundo/);
    expect(titles[0].textContent).toBe("Primeiro");
    expect(titles[1].textContent).toBe("Segundo");
  });

  it("renders book cover image when cover_url is provided", () => {
    render(
      <ReadingTimeline
        books={[
          makeBook({
            book_title: "Com Capa",
            book_cover_url: "https://example.com/cover.jpg",
            finished_at: "2026-01-01T00:00:00Z",
          }),
        ]}
      />,
    );
    const img = screen.getByAltText("Com Capa");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/cover.jpg");
  });

  it("renders BookOpen fallback icon when no cover_url", () => {
    render(<ReadingTimeline books={[makeBook({ book_cover_url: null })]} />);
    // The BookOpen icon won't have alt text, but the image should not be present
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows formatted date below book title", () => {
    render(
      <ReadingTimeline
        books={[makeBook({ finished_at: "2026-01-15T00:00:00Z" })]}
      />,
    );
    // Formatted as pt-BR short month + year
    expect(screen.getByText(/jan\.|jan/i)).toBeInTheDocument();
  });
});
