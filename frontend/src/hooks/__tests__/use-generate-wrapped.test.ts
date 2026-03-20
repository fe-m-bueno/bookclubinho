import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  withCsrf: vi.fn((headers: Record<string, string>) => ({
    ...headers,
    "X-CSRF-Token": "test-csrf-token",
  })),
}));

import { useGenerateWrapped } from "../use-generate-wrapped";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
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
    genre_breakdown: [],
    highest_rated_book: null,
    most_active_member: null,
    longest_streak_member: null,
    funniest_oneliner: null,
    most_emotional_book: null,
    member_superlatives: [],
    emotional_stats: {
      total_reviews: 0,
      cried_count: 0,
      loved_it_count: 0,
      felt_aroused_count: 0,
      found_heavy_count: 0,
      wants_more_count: 0,
    },
    member_avatars: [],
  },
};

describe("useGenerateWrapped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with loading false and no error", () => {
    const { result } = renderHook(() => useGenerateWrapped());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("POST success returns wrapped data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    let returnValue: WrappedResponse | null = null;
    await act(async () => {
      returnValue = await result.current.generate("g1", 2024);
    });

    expect(returnValue).toEqual(mockWrapped);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading to true while generating", async () => {
    let resolveRequest!: (value: Response) => void;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pendingRequest);

    const { result } = renderHook(() => useGenerateWrapped());

    act(() => {
      void result.current.generate("g1", 2024);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    resolveRequest({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sends CSRF token in request headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    await act(async () => {
      await result.current.generate("g1", 2024);
    });

    expect(ensureCsrf).toHaveBeenCalled();
    expect(withCsrf).toHaveBeenCalledWith({ "Content-Type": "application/json" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/groups/g1/wrapped/2024",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "test-csrf-token" }),
      }),
    );
  });

  it("sets error on non-ok response with detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Você não tem permissão." }),
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    let returnValue: WrappedResponse | null = null;
    await act(async () => {
      returnValue = await result.current.generate("g1", 2024);
    });

    expect(returnValue).toBeNull();
    expect(result.current.error).toBe("Você não tem permissão.");
    expect(result.current.loading).toBe(false);
  });

  it("uses default error message when response has no detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    await act(async () => {
      await result.current.generate("g1", 2024);
    });

    expect(result.current.error).toBe("Erro ao gerar o Wrapped.");
  });

  it("sets connection error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useGenerateWrapped());

    await act(async () => {
      await result.current.generate("g1", 2024);
    });

    expect(result.current.error).toBe("Erro de conexão.");
    expect(result.current.loading).toBe(false);
  });

  it("uses groupId and year in the POST URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    await act(async () => {
      await result.current.generate("group-abc", 2023);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/groups/group-abc/wrapped/2023",
      expect.any(Object),
    );
  });

  it("clears previous error before a new request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Erro anterior" }),
    } as Response);

    const { result } = renderHook(() => useGenerateWrapped());

    await act(async () => {
      await result.current.generate("g1", 2024);
    });

    expect(result.current.error).toBe("Erro anterior");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockWrapped,
    } as Response);

    await act(async () => {
      await result.current.generate("g1", 2024);
    });

    expect(result.current.error).toBeNull();
  });
});
