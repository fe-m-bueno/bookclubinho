import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGroupStats } from "@/hooks/use-group-stats";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// As mecânicas (loading, erro, refetch, credenciais) são de useApiQuery e
// lib/api, testadas lá. Aqui fica só o que é deste hook: caminho e formato.
describe("useGroupStats", () => {
  it("busca as estatísticas do grupo", async () => {
    const stats = { total_books: 3, total_pages: 900 };
    get.mockResolvedValue(stats);

    const { result } = renderApiHook(() => useGroupStats("g1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith("/groups/g1/stats");
    expect(result.current.data).toEqual(stats);
  });
});
