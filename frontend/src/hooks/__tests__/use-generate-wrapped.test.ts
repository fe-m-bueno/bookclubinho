import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGenerateWrapped } from "@/hooks/use-generate-wrapped";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { post: vi.fn() } };
});

import { api } from "@/lib/api";

const post = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// CSRF e credenciais são de lib/api, testados lá.
describe("useGenerateWrapped", () => {
  it("começa sem loading e sem erro", () => {
    const { result } = renderHook(() => useGenerateWrapped());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("devolve o wrapped gerado", async () => {
    const wrapped = { year: 2026, total_books: 5 };
    post.mockResolvedValue(wrapped);

    const { result } = renderHook(() => useGenerateWrapped());
    let out: unknown;
    await act(async () => {
      out = await result.current.generate("g1", 2026);
    });

    expect(out).toEqual(wrapped);
    expect(post).toHaveBeenCalledWith("/groups/g1/wrapped/2026");
  });

  it("marca loading enquanto gera", async () => {
    let resolve!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useGenerateWrapped());
    act(() => {
      void result.current.generate("g1", 2026);
    });

    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => {
      resolve({ year: 2026 });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("expõe a mensagem do backend na falha", async () => {
    post.mockRejectedValue(new ApiError(409, "Wrapped já foi gerado este ano."));

    const { result } = renderHook(() => useGenerateWrapped());
    let out: unknown;
    await act(async () => {
      out = await result.current.generate("g1", 2026);
    });

    expect(out).toBeNull();
    expect(result.current.error).toBe("Wrapped já foi gerado este ano.");
  });

  it("erro de rede vira mensagem de conexão", async () => {
    post.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useGenerateWrapped());
    await act(async () => {
      await result.current.generate("g1", 2026);
    });

    expect(result.current.error).toBe("Erro de conexão. Verifique sua internet.");
  });

  it("limpa o erro anterior antes de tentar de novo", async () => {
    post.mockRejectedValueOnce(new ApiError(500, "Erro interno."));
    const { result } = renderHook(() => useGenerateWrapped());
    await act(async () => {
      await result.current.generate("g1", 2026);
    });
    expect(result.current.error).not.toBeNull();

    post.mockResolvedValueOnce({ year: 2026 });
    await act(async () => {
      await result.current.generate("g1", 2026);
    });
    expect(result.current.error).toBeNull();
  });
});
