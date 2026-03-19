import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useBookSearch } from "../use-book-search";

const mockResults = [
  {
    book_id: "b1",
    title: "O Hobbit",
    author: "J.R.R. Tolkien",
    cover_url: null,
    slug: "o-hobbit",
    description: null,
    page_count: 310,
  },
];

describe("useBookSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty results for empty query", () => {
    const { result } = renderHook(() => useBookSearch(""));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("returns empty results for query shorter than 2 chars", () => {
    const { result } = renderHook(() => useBookSearch("a"));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("does not fetch for short queries", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useBookSearch("a"));

    vi.runAllTimers();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches after 300ms debounce", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResults,
    } as Response);

    renderHook(() => useBookSearch("hobbit"));

    expect(fetchSpy).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/books/search?q=hobbit"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("returns search results on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const { result } = renderHook(() => useBookSearch("hobbit"));

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.results).toEqual(mockResults);
    expect(result.current.loading).toBe(false);
  });

  it("returns empty results on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useBookSearch("hobbit"));

    await act(() => vi.advanceTimersByTimeAsync(300));

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("cancels pending timer on query change", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const { rerender } = renderHook(({ q }) => useBookSearch(q), {
      initialProps: { q: "hobbit" },
    });

    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ q: "tolkien" });
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Should only call once with "tolkien", not "hobbit"
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("tolkien"),
      expect.anything(),
    );
  });
});
