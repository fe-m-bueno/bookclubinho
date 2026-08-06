import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBookSearch } from "@/hooks/use-book-search";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe("useBookSearch", () => {
  it("menos de 2 caracteres não busca", () => {
    const { result } = renderApiHook(() => useBookSearch("a"));
    expect(get).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("busca depois do debounce", async () => {
    get.mockResolvedValue([{ id: "b1", title: "Duna" }]);
    const { result } = renderApiHook(() => useBookSearch("duna"));

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(get).toHaveBeenCalledWith("/books/search?q=duna&limit=10");
  });

  it("falha devolve lista vazia, como antes", async () => {
    // O hook antigo engolia o erro devolvendo []; busca vazia e busca quebrada
    // são indistinguíveis para o usuário.
    get.mockRejectedValue(new ApiError(500, "Hardcover fora do ar."));
    const { result } = renderApiHook(() => useBookSearch("duna"));

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
  });
});
