import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useGroupProgress } from "../use-group-progress";

const mockGroupProgress = {
  progress: [
    {
      user_id: "u1",
      current_page: 120,
      percentage: 60,
      is_finished: false,
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      user_id: "u2",
      current_page: null,
      percentage: 100,
      is_finished: true,
      updated_at: "2026-01-02T00:00:00Z",
    },
  ],
};

describe("useGroupProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches progress data successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockGroupProgress,
    } as Response);

    const { result } = renderHook(() => useGroupProgress("r1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.progress).toEqual(mockGroupProgress.progress);
    expect(result.current.error).toBeNull();
  });

  it("calls API with correct URL and credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockGroupProgress,
    } as Response);

    renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/rounds/r1/progress"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("sets progress to empty array on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.progress).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets access error on 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const { result } = renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Sem acesso ao progresso desta rodada.",
      );
    });
  });

  it("sets generic error on other status codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar progresso. Tente novamente.",
      );
    });
  });

  it("sets connection error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("exposes refetch function that re-fetches data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockGroupProgress,
    } as Response);

    const { result } = renderHook(() => useGroupProgress("r1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("polling behavior", () => {
    beforeEach(() => {
      // Only fake interval timers — setTimeout remains real so waitFor still works
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls every 30 seconds", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockGroupProgress,
      } as Response);

      renderHook(() => useGroupProgress("r1"));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      });

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(3);
      });
    });

    it("clears interval on unmount", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockGroupProgress,
      } as Response);

      const { unmount } = renderHook(() => useGroupProgress("r1"));

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      });

      unmount();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      // After unmount, no additional calls should be made
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

  });
});
