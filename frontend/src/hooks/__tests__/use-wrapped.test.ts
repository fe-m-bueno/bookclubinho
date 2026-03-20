import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useWrapped } from "../use-wrapped";
import type { WrappedResponse } from "@/lib/types/wrapped";

const mockWrapped: WrappedResponse = {
  group_id: "g1",
  year: 2024,
  generated_at: "2024-12-31T23:59:59Z",
  generated_by: "u1",
  data: {
    year: 2024,
    group_name: "Clube do Livro",
    group_photo_url: null,
    total_books_read: 8,
    total_pages: 3200,
    total_reading_hours: 64,
    genre_breakdown: [{ genre: "Ficção", count: 5, percentage: 62.5 }],
    highest_rated_book: {
      title: "O Nome do Vento",
      cover_url: null,
      author: "Patrick Rothfuss",
      avg_rating: 4.8,
    },
    most_active_member: {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
    },
    longest_streak_member: null,
    funniest_oneliner: {
      text: "Li esse livro três vezes e ainda não entendi nada.",
      author_username: "bob",
      author_display_name: "Bob",
      author_avatar_url: null,
      vote_count: 5,
    },
    most_emotional_book: null,
    member_superlatives: [
      {
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        avatar_url: null,
        title: "Leitora Mais Rápida",
        emoji: "⚡",
        stat_label: "livros",
        stat_value: "8",
      },
    ],
    emotional_stats: {
      total_reviews: 8,
      cried_count: 2,
      loved_it_count: 7,
      felt_aroused_count: 1,
      found_heavy_count: 3,
      wants_more_count: 5,
    },
    member_avatars: [
      {
        user_id: "u1",
        username: "alice",
        display_name: "Alice",
        avatar_url: null,
      },
    ],
  },
};

describe("useWrapped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches wrapped successfully and sets data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockWrapped);
    expect(result.current.error).toBeNull();
  });

  it("starts in loading state", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("calls API with correct URL and credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/groups/g1/wrapped/2024",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("returns data null and no error on 404 (not generated yet)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error on non-401 non-404 failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar o Wrapped. Tente novamente.",
      );
    });

    expect(result.current.data).toBeNull();
  });

  it("sets connection error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("ignores AbortError gracefully and does not set error", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it("refetch triggers a new API call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useWrapped("g1", 2024));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("uses groupId and year in the request URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    renderHook(() => useWrapped("my-group-99", 2023));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/groups/my-group-99/wrapped/2023",
        expect.any(Object),
      );
    });
  });
});
