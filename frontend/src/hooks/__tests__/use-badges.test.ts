import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBadgeProgress, useBadges } from "@/hooks/use-badges";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

const MY = { badges: { achievement: [{ slug: "founder" }] } };
const CATALOG = { badges: [{ slug: "founder" }, { slug: "bookworm" }] };

function mockBoth() {
  get.mockImplementation(async (path: string) =>
    path === "/users/me/badges" ? MY : CATALOG,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("useBadges", () => {
  it("junta as conquistas do usuário e o catálogo", async () => {
    mockBoth();

    const { result } = renderApiHook(() => useBadges());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.myBadges).toEqual(MY.badges);
    expect(result.current.catalog).toHaveLength(2);
  });

  it("as duas chamadas são independentes — cada uma com sua chave", async () => {
    // Antes era um Promise.all sob um único estado, então o catálogo (igual
    // para todo mundo) era refetchado junto com as conquistas do usuário.
    mockBoth();

    const { result } = renderApiHook(() => useBadges());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const paths = get.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/users/me/badges");
    expect(paths).toContain("/badges");
  });

  it("falha em qualquer uma das duas vira erro", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/badges") throw new ApiError(500, "Catálogo indisponível.");
      return MY;
    });

    const { result } = renderApiHook(() => useBadges());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("Catálogo indisponível.");
  });
});

describe("fetchBadgeProgress", () => {
  it("busca o progresso de uma badge", async () => {
    get.mockResolvedValue({ current: 3, target: 5 });

    await expect(fetchBadgeProgress("bookworm")).resolves.toEqual({
      current: 3,
      target: 5,
    });
    expect(get).toHaveBeenCalledWith("/badges/bookworm/progress");
  });

  it("propaga a falha, como antes", async () => {
    get.mockRejectedValue(new ApiError(404, "Badge não encontrada."));
    await expect(fetchBadgeProgress("nope")).rejects.toThrow();
  });
});
