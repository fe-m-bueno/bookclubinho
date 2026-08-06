import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGroupProgress } from "@/hooks/use-group-progress";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("useGroupProgress", () => {
  it("desmonta a resposta em progress e roundStartedAt", async () => {
    get.mockResolvedValue({
      progress: [{ user_id: "u1", percentage: 42 }],
      round_started_at: "2026-01-01T00:00:00Z",
    });

    const { result } = renderApiHook(() => useGroupProgress("r1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith("/rounds/r1/progress");
    expect(result.current.progress).toHaveLength(1);
    expect(result.current.roundStartedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("round_started_at ausente vira null", async () => {
    get.mockResolvedValue({ progress: [] });

    const { result } = renderApiHook(() => useGroupProgress("r1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roundStartedAt).toBeNull();
  });
});
