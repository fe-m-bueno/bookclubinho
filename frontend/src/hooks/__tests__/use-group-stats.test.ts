import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useGroupStats } from "../use-group-stats";
import type { GroupStatsResponse } from "@/lib/types/stats";

const mockStats: GroupStatsResponse = {
  total_books_read: 5,
  total_pages_read: 1500,
  average_rating: 4.2,
  total_reading_time_minutes: 3000,
  books_per_genre: [{ genre: "Ficção", count: 3 }],
  member_leaderboard: [
    {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      books_finished: 5,
      avg_rating: 4.2,
      current_streak: 7,
      reading_time_minutes: 3000,
      reviews_count: 5,
      badges_count: 3,
    },
  ],
  rating_distribution: [
    { stars: 4, count: 3 },
    { stars: 5, count: 2 },
  ],
  emotional_stats: {
    total_reviews: 5,
    cried_count: 1,
    loved_it_count: 4,
    felt_aroused_count: 0,
    found_heavy_count: 2,
    wants_more_count: 3,
  },
};

describe("useGroupStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches stats successfully and sets data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    const { result } = renderHook(() => useGroupStats("g1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockStats);
    expect(result.current.error).toBeNull();
  });

  it("starts in loading state", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    const { result } = renderHook(() => useGroupStats("g1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("calls API with correct URL and credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    renderHook(() => useGroupStats("g1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/groups/g1/stats",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useGroupStats("g1"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error on non-401 failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useGroupStats("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar as estatísticas. Tente novamente.",
      );
    });

    expect(result.current.data).toBeNull();
  });

  it("sets connection error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useGroupStats("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("ignores AbortError gracefully and does not set error", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useGroupStats("g1"));

    // Wait for the async fetch to settle
    await waitFor(() => {
      // Error should never be set for AbortError
      expect(result.current.error).toBeNull();
    });
  });

  it("refetch triggers a new API call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockStats,
    } as Response);

    const { result } = renderHook(() => useGroupStats("g1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    result.current.refetch();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("uses groupId in the request URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    } as Response);

    renderHook(() => useGroupStats("my-group-id-123"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/groups/my-group-id-123/stats",
        expect.any(Object),
      );
    });
  });
});
