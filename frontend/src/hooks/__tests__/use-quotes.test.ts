import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  withCsrf: vi.fn((h: Record<string, string> = {}) => ({
    ...h,
    "X-CSRF-Token": "test-token",
  })),
}));

import { useQuotes, useQuoteMutations } from "../use-quotes";
import type { QuoteResponse, QuoteListResponse } from "@/lib/types/quote";

const mockQuote: QuoteResponse = {
  id: "q1",
  user_id: "u1",
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
  quote_text: "A vida é bela.",
  page_reference: "p. 42",
  book_title: "Dom Casmurro",
  book_author: "Machado de Assis",
  round_id: "r1",
  vote_count: 5,
  did_i_vote: false,
  created_at: "2026-01-01T00:00:00Z",
};

const mockQuoteListResponse: QuoteListResponse = {
  quotes: [mockQuote],
  next_cursor: null,
};

const mockQuoteListWithCursor: QuoteListResponse = {
  quotes: [mockQuote],
  next_cursor: "cursor-abc",
};

describe("useQuotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuoteListResponse,
    } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.quotes).toEqual([]);
  });

  it("fetches quotes successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuoteListResponse,
    } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.quotes).toEqual([mockQuote]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("calls API with correct sort and groupId", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuoteListResponse,
    } as Response);

    renderHook(() => useQuotes({ groupId: "g1", sort: "recent" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/groups/g1/quotes"),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("sort=recent");
  });

  it("includes round_id param when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuoteListResponse,
    } as Response);

    renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes", roundId: "r1" }),
    );

    await waitFor(() => {
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("round_id=r1");
    });
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useQuotes({ groupId: "g1", sort: "votes" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar quotes. Tente novamente.",
      );
    });
  });

  it("sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("does not set error on AbortError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it("sets hasMore true when next_cursor is present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuoteListWithCursor,
    } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
  });

  it("loadMore appends more quotes to the list", async () => {
    const secondPage: QuoteListResponse = {
      quotes: [
        {
          ...mockQuote,
          id: "q2",
          quote_text: "Segunda quote.",
        },
      ],
      next_cursor: null,
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuoteListWithCursor,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => secondPage,
      } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.hasMore).toBe(true);
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.quotes).toHaveLength(2);
      expect(result.current.hasMore).toBe(false);
    });
  });

  it("refetch resets quotes and fetches again", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuoteListResponse,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockQuoteListResponse,
      } as Response);

    const { result } = renderHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("resets quotes when sort changes", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => mockQuoteListResponse,
      } as Response);

    const { result, rerender } = renderHook(
      ({ sort }: { sort: "votes" | "recent" }) =>
        useQuotes({ groupId: "g1", sort }),
      { initialProps: { sort: "votes" as "votes" | "recent" } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.quotes).toHaveLength(1);
    });

    rerender({ sort: "recent" as const });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.quotes).toHaveLength(1);
  });
});

describe("useQuoteMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createQuote returns quote on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuote,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let quote: QuoteResponse | null = null;
    await act(async () => {
      quote = await result.current.createQuote({
        quote_text: "A vida é bela.",
      });
    });

    expect(quote).toEqual(mockQuote);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/groups/g1/quotes",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("createQuote returns null on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let quote: QuoteResponse | null = mockQuote;
    await act(async () => {
      quote = await result.current.createQuote({ quote_text: "test" });
    });

    expect(quote).toBeNull();
  });

  it("createQuote returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let quote: QuoteResponse | null = mockQuote;
    await act(async () => {
      quote = await result.current.createQuote({ quote_text: "test" });
    });

    expect(quote).toBeNull();
  });

  it("toggleVote returns voted boolean on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ voted: true }),
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let voted: boolean | null = null;
    await act(async () => {
      voted = await result.current.toggleVote("q1");
    });

    expect(voted).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/quotes/q1/vote",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("toggleVote returns null on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let voted: boolean | null = true;
    await act(async () => {
      voted = await result.current.toggleVote("q1");
    });

    expect(voted).toBeNull();
  });

  it("deleteQuote returns true on 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let success = false;
    await act(async () => {
      success = await result.current.deleteQuote("q1");
    });

    expect(success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/quotes/q1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      }),
    );
  });

  it("deleteQuote returns true on 204", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 204,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let success = false;
    await act(async () => {
      success = await result.current.deleteQuote("q1");
    });

    expect(success).toBe(true);
  });

  it("deleteQuote returns false on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let success = true;
    await act(async () => {
      success = await result.current.deleteQuote("q1");
    });

    expect(success).toBe(false);
  });

  it("deleteQuote returns false on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useQuoteMutations("g1"));

    let success = true;
    await act(async () => {
      success = await result.current.deleteQuote("q1");
    });

    expect(success).toBe(false);
  });
});
