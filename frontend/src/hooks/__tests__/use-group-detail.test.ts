import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { useGroupDetail } from "../use-group-detail";

const mockGroup = {
  id: "g1",
  name: "Clube Literário",
  description: "Um clube de leitura",
  photo_url: null,
  invite_code: "ABC123",
  max_members: 8,
  member_count: 3,
  members: [
    {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      role: "admin" as const,
      joined_at: "2026-01-01T00:00:00Z",
    },
  ],
  current_user_id: "u1",
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("useGroupDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches group data successfully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockGroup,
    } as Response);

    const { result } = renderHook(() => useGroupDetail("g1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.group).toEqual(mockGroup);
    expect(result.current.error).toBeNull();
  });

  it("calls API with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockGroup,
    } as Response);

    renderHook(() => useGroupDetail("g1"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/groups/g1"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("redirects to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    renderHook(() => useGroupDetail("g1"));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("sets error on 403", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const { result } = renderHook(() => useGroupDetail("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe("Sem acesso a este grupo.");
    });
  });

  it("sets error on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useGroupDetail("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe("Grupo não encontrado.");
    });
  });

  it("sets error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useGroupDetail("g1"));

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

    const { result } = renderHook(() => useGroupDetail("g1"));

    await waitFor(() => {
      expect(result.current.error).toBe(
        "Erro ao carregar grupo. Tente novamente.",
      );
    });
  });
});
