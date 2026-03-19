import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useCurrentRound } from "../use-current-round";

const mockRound = {
  id: "r1",
  round_number: 1,
  book_id: null,
  book_title: null,
  book_author: null,
  book_cover_url: null,
  book_page_count: null,
  status: "nominating",
  deadline: null,
  started_at: "2026-01-01T00:00:00Z",
  finished_at: null,
  created_at: "2026-01-01T00:00:00Z",
  nominations: [],
};

describe("useCurrentRound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches round data successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockRound,
    } as Response);

    const { result } = renderHook(() => useCurrentRound("g1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.round).toEqual(mockRound);
    expect(result.current.error).toBeNull();
  });

  it("calls API with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockRound,
    } as Response);

    renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/groups/g1/rounds/current"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("sets round to null on 404 without error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.round).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error on 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const { result } = renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe("Sem acesso a esta rodada.");
    });
  });

  it("sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("sets generic error on other status codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useCurrentRound("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar rodada. Tente novamente.",
      );
    });
  });
});
