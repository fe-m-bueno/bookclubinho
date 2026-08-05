import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWrapped } from "@/hooks/use-wrapped";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("useWrapped", () => {
  it("busca o wrapped do ano", async () => {
    get.mockResolvedValue({ year: 2026 });

    const { result } = renderApiHook(() => useWrapped("g1", 2026));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith("/groups/g1/wrapped/2026");
    expect(result.current.data).toEqual({ year: 2026 });
  });

  it("wrapped ainda não gerado não é erro", async () => {
    get.mockRejectedValue(new ApiError(404, "Não encontrado."));

    const { result } = renderApiHook(() => useWrapped("g1", 2026));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
