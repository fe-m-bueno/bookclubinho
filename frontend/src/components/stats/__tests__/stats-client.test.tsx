import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsClient } from "@/components/stats/stats-client";
import type { GroupStatsResponse } from "@/lib/types/stats";
import type { ShelfResponse } from "@/lib/types/shelf";

// Mock hooks
const mockUseGroupStats = vi.fn();
const mockUseShelf = vi.fn();

vi.mock("@/hooks/use-group-stats", () => ({
  useGroupStats: (...args: unknown[]) => mockUseGroupStats(...args),
}));
vi.mock("@/hooks/use-shelf", () => ({
  useShelf: (...args: unknown[]) => mockUseShelf(...args),
}));

// Mock child components to isolate StatsClient logic
vi.mock("@/components/stats/stats-skeleton", () => ({
  StatsSkeleton: () => <div data-testid="stats-skeleton" />,
}));
vi.mock("@/components/stats/stats-overview-cards", () => ({
  StatsOverviewCards: () => <div data-testid="stats-overview-cards" />,
}));
vi.mock("@/components/stats/rating-distribution-chart", () => ({
  RatingDistributionChart: () => <div data-testid="rating-distribution-chart" />,
}));
vi.mock("@/components/stats/genre-breakdown-chart", () => ({
  GenreBreakdownChart: () => <div data-testid="genre-breakdown-chart" />,
}));
vi.mock("@/components/stats/member-leaderboard", () => ({
  MemberLeaderboard: () => <div data-testid="member-leaderboard" />,
}));
vi.mock("@/components/stats/emotional-stats-section", () => ({
  EmotionalStatsSection: () => <div data-testid="emotional-stats-section" />,
}));
vi.mock("@/components/stats/reading-timeline", () => ({
  ReadingTimeline: () => <div data-testid="reading-timeline" />,
}));

const mockStats: GroupStatsResponse = {
  total_books_read: 3,
  total_pages_read: 900,
  average_rating: 4.0,
  total_reading_time_minutes: 1800,
  books_per_genre: [{ genre: "Fantasia", count: 2 }],
  member_leaderboard: [],
  rating_distribution: [{ stars: 4, count: 3 }],
  emotional_stats: {
    total_reviews: 3,
    cried_count: 1,
    loved_it_count: 2,
    felt_aroused_count: 0,
    found_heavy_count: 1,
    wants_more_count: 2,
  },
};

const mockShelf: ShelfResponse = {
  group_name: "Clube",
  group_photo_url: null,
  books: [],
};

function setupShelf(overrides?: Partial<ReturnType<typeof mockUseShelf>>) {
  mockUseShelf.mockReturnValue({
    data: mockShelf,
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe("StatsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", () => {
    mockUseGroupStats.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByTestId("stats-skeleton")).toBeInTheDocument();
  });

  it("shows error state with retry button", () => {
    const refetch = vi.fn();
    mockUseGroupStats.mockReturnValue({
      data: null,
      loading: false,
      error: "Erro ao carregar as estatísticas. Tente novamente.",
      refetch,
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(
      screen.getByText("Erro ao carregar as estatísticas. Tente novamente."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tentar novamente/i }),
    ).toBeInTheDocument();
  });

  it("calls refetch when retry button is clicked", () => {
    const refetch = vi.fn();
    mockUseGroupStats.mockReturnValue({
      data: null,
      loading: false,
      error: "Erro",
      refetch,
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows empty state when total_books_read is 0", () => {
    mockUseGroupStats.mockReturnValue({
      data: { ...mockStats, total_books_read: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByText("Nenhum livro lido ainda")).toBeInTheDocument();
  });

  it("shows empty state when data is null", () => {
    mockUseGroupStats.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByText("Nenhum livro lido ainda")).toBeInTheDocument();
  });

  it("renders all main sections when data is available", () => {
    mockUseGroupStats.mockReturnValue({
      data: mockStats,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByTestId("stats-overview-cards")).toBeInTheDocument();
    expect(screen.getByTestId("rating-distribution-chart")).toBeInTheDocument();
    expect(screen.getByTestId("genre-breakdown-chart")).toBeInTheDocument();
    expect(screen.getByTestId("member-leaderboard")).toBeInTheDocument();
    expect(screen.getByTestId("reading-timeline")).toBeInTheDocument();
  });

  it("shows emotional stats section when total_reviews > 0", () => {
    mockUseGroupStats.mockReturnValue({
      data: mockStats,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByTestId("emotional-stats-section")).toBeInTheDocument();
  });

  it("hides emotional stats section when total_reviews === 0", () => {
    mockUseGroupStats.mockReturnValue({
      data: {
        ...mockStats,
        emotional_stats: { ...mockStats.emotional_stats, total_reviews: 0 },
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(
      screen.queryByTestId("emotional-stats-section"),
    ).not.toBeInTheDocument();
  });

  it("renders badges link", () => {
    mockUseGroupStats.mockReturnValue({
      data: mockStats,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(
      screen.getByRole("link", { name: /ver conquistas/i }),
    ).toBeInTheDocument();
  });

  it("renders wrapped banner in December", () => {
    vi.useFakeTimers({ now: new Date("2026-12-01T12:00:00") });

    mockUseGroupStats.mockReturnValue({
      data: mockStats,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.getByRole("link", { name: /ver agora/i })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("hides wrapped banner outside December", () => {
    vi.useFakeTimers({ now: new Date("2026-06-01T12:00:00") });

    mockUseGroupStats.mockReturnValue({
      data: mockStats,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="g1" />);

    expect(screen.queryByRole("link", { name: /ver agora/i })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("passes groupId to useGroupStats", () => {
    mockUseGroupStats.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    setupShelf();

    render(<StatsClient groupId="specific-group-id" />);

    expect(mockUseGroupStats).toHaveBeenCalledWith("specific-group-id");
  });
});
