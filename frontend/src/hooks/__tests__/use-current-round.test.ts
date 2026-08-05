import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentRound } from "@/hooks/use-current-round";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("useCurrentRound", () => {
  it("expõe a rodada ativa", async () => {
    const round = { id: "r1", status: "reading" };
    get.mockResolvedValue(round);

    const { result } = renderApiHook(() => useCurrentRound("g1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(get).toHaveBeenCalledWith("/groups/g1/rounds/current");
    expect(result.current.round).toEqual(round);
  });

  it("clube sem rodada ativa não é erro", async () => {
    // O backend devolve 404; para a UI é ausência, e a tela mostra o convite
    // para criar a primeira rodada.
    get.mockRejectedValue(new ApiError(404, "Nenhuma rodada ativa."));

    const { result } = renderApiHook(() => useCurrentRound("g1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.round).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
