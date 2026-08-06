import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { getOrNull } from "@/lib/get-or-null";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("getOrNull", () => {
  it("devolve o corpo quando a rota responde", async () => {
    get.mockResolvedValue({ id: "r1" });
    await expect(getOrNull("/rounds/current")).resolves.toEqual({ id: "r1" });
    expect(get).toHaveBeenCalledWith("/rounds/current");
  });

  it("404 é ausência, não erro", async () => {
    // Clube sem rodada ativa, wrapped não gerado, review não enviada.
    get.mockRejectedValue(new ApiError(404, "Nenhuma rodada ativa."));
    await expect(getOrNull("/rounds/current")).resolves.toBeNull();
  });

  it("outros status continuam erro", async () => {
    get.mockRejectedValue(new ApiError(500, "Erro interno."));
    await expect(getOrNull("/rounds/current")).rejects.toThrow("Erro interno.");
  });

  it("falha de rede não vira ausência", async () => {
    get.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getOrNull("/rounds/current")).rejects.toThrow("Failed to fetch");
  });
});
