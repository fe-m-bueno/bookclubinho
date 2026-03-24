import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ShelfClient } from "@/components/shelf/shelf-client";
import type { ShelfResponse } from "@/lib/types/shelf";

// Mock useGroup
vi.mock("@/lib/contexts/group-context", () => ({
  useGroup: () => ({
    group: {
      id: "group-1",
      name: "Clube Teste",
      member_count: 4,
      max_members: 8,
      members: [],
      current_user_id: "user-1",
    },
    refetch: vi.fn(),
  }),
}));

// Mock useShelf
const mockUseShelf = vi.fn();
vi.mock("@/hooks/use-shelf", () => ({
  useShelf: (...args: unknown[]) => mockUseShelf(...args),
}));

// Mock child components
vi.mock("@/components/shelf/shelf-skeleton", () => ({
  ShelfSkeleton: () => <div data-testid="shelf-skeleton" />,
}));
vi.mock("@/components/shelf/shelf-empty-state", () => ({
  ShelfEmptyState: () => <div data-testid="shelf-empty-state" />,
}));
vi.mock("@/components/shelf/shelf-grid", () => ({
  ShelfGrid: ({ books }: { books: unknown[] }) => (
    <div data-testid="shelf-grid">{books.length} books</div>
  ),
}));

// Mock ShareButton to avoid clipboard setup complexity
vi.mock("@/app/shelf/[id]/share-button", () => ({
  ShareButton: ({ label }: { label?: string }) => (
    <button type="button">{label ?? "Compartilhar"}</button>
  ),
}));

const mockShelf: ShelfResponse = {
  group_name: "Clube Teste",
  group_photo_url: null,
  books: [
    {
      book_title: "Livro A",
      book_author: "Autor A",
      book_cover_url: null,
      page_count: 300,
      genres: [],
      average_rating: 4,
      review_count: 2,
      started_at: null,
      finished_at: "2026-01-31T00:00:00",
      top_oneliners: [],
    },
  ],
};

describe("ShelfClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", () => {
    vi.useFakeTimers();
    mockUseShelf.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<ShelfClient />);
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByTestId("shelf-skeleton")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows error state and retry button", () => {
    const refetch = vi.fn();
    mockUseShelf.mockReturnValue({
      data: null,
      loading: false,
      error: "Erro ao carregar.",
      refetch,
    });
    render(<ShelfClient />);
    expect(screen.getByText("Erro ao carregar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar/i })).toBeInTheDocument();
  });

  it("shows empty state when books array is empty", () => {
    mockUseShelf.mockReturnValue({
      data: { group_name: "G", group_photo_url: null, books: [] },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ShelfClient />);
    expect(screen.getByTestId("shelf-empty-state")).toBeInTheDocument();
  });

  it("renders ShelfGrid with books when data is available", () => {
    mockUseShelf.mockReturnValue({
      data: mockShelf,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ShelfClient />);
    expect(screen.getByTestId("shelf-grid")).toBeInTheDocument();
    expect(screen.getByText("1 books")).toBeInTheDocument();
  });

  it("shows book count in header", () => {
    mockUseShelf.mockReturnValue({
      data: mockShelf,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ShelfClient />);
    expect(screen.getByText("1 livro lido")).toBeInTheDocument();
  });

  it("shows share button", () => {
    mockUseShelf.mockReturnValue({
      data: mockShelf,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ShelfClient />);
    expect(
      screen.getByRole("button", { name: /compartilhar/i }),
    ).toBeInTheDocument();
  });
});
