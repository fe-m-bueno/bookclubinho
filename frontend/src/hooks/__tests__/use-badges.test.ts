import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useBadges, fetchBadgeProgress } from "../use-badges";
import { jsonResponse } from "@/test-utils/http";

const mockMyBadges = {
  badges: {
    reading: [
      {
        slug: "first-book",
        name: "Primeiro Livro",
        description: "Leu o primeiro livro",
        emoji: "📖",
        category: "reading",
        earned_at: "2026-01-10T10:00:00Z",
        group_name: "Clube Literário",
        book_title: "Dom Casmurro",
      },
    ],
  },
};

const mockCatalog = {
  badges: [
    {
      slug: "first-book",
      name: "Primeiro Livro",
      description: "Leu o primeiro livro",
      emoji: "📖",
      category: "reading",
      earned_at: null,
      group_name: null,
      book_title: null,
    },
    {
      slug: "bookworm",
      name: "Leitor Ávido",
      description: "Leu 5 livros",
      emoji: "🐛",
      category: "reading",
      earned_at: null,
      group_name: null,
      book_title: null,
    },
  ],
};

describe("useBadges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(mockMyBadges, 200));

    const { result } = renderHook(() => useBadges());
    expect(result.current.loading).toBe(true);
  });

  it("fetches both endpoints and returns merged data", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(mockMyBadges, 200))
      .mockResolvedValueOnce(jsonResponse(mockCatalog, 200));

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.myBadges).toEqual(mockMyBadges.badges);
    expect(result.current.catalog).toEqual(mockCatalog.badges);
    expect(result.current.error).toBeNull();
  });

  it("calls both API endpoints with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse(mockMyBadges, 200));

    fetchSpy.mockResolvedValueOnce(jsonResponse(mockMyBadges, 200)).mockResolvedValueOnce(jsonResponse(mockCatalog, 200));

    renderHook(() => useBadges());

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/users/me/badges",
        expect.objectContaining({ credentials: "include" }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/badges",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("redirects to login when my badges returns 401", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(({}), 401))
      .mockResolvedValueOnce(jsonResponse(mockCatalog, 200));

    renderHook(() => useBadges());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("redirects to login when catalog returns 401", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(mockMyBadges, 200))
      .mockResolvedValueOnce(jsonResponse(({}), 401));

    renderHook(() => useBadges());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error when my badges request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(({}), 500))
      .mockResolvedValueOnce(jsonResponse(mockCatalog, 200));

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar conquistas. Tente novamente.",
      );
    });
  });

  it("sets error when catalog request fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(mockMyBadges, 200))
      .mockResolvedValueOnce(jsonResponse(({}), 500));

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar catálogo de conquistas. Tente novamente.",
      );
    });
  });

  it("sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("does not set error on AbortError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new DOMException("Aborted", "AbortError")),
    );

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it("refetch triggers a new request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse(mockMyBadges, 200));

    fetchSpy
      .mockResolvedValueOnce(jsonResponse(mockMyBadges, 200))
      .mockResolvedValueOnce(jsonResponse(mockCatalog, 200))
      .mockResolvedValueOnce(jsonResponse(mockMyBadges, 200))
      .mockResolvedValueOnce(jsonResponse(mockCatalog, 200));

    const { result } = renderHook(() => useBadges());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    result.current.refetch();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });
  });
});

describe("fetchBadgeProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches progress for a badge slug", async () => {
    const mockProgress = {
      slug: "bookworm",
      name: "Leitor Ávido",
      emoji: "🐛",
      current: 3,
      target: 5,
      percentage: 60,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(mockProgress));

    const result = await fetchBadgeProgress("bookworm");

    expect(result).toEqual(mockProgress);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/v1/badges/bookworm/progress",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(fetchBadgeProgress("non-existent")).rejects.toThrow(
      "Failed to fetch progress for badge: non-existent",
    );
  });
});
