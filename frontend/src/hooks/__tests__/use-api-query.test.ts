import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useApiQuery } from "@/hooks/use-api-query";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

/**
 * As mecânicas que catorze hooks repetiam à mão vivem aqui agora, e são
 * testadas uma vez. URL, credenciais e CSRF são de `lib/api`; o redirect do 401
 * é do `Providers`.
 */
describe("useApiQuery", () => {
  it("expõe os dados no formato que os componentes esperam", async () => {
    get.mockResolvedValue({ nome: "Clube" });

    const { result } = renderApiHook(() =>
      useApiQuery<{ nome: string }>(["k"], "/groups/1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ nome: "Clube" });
    expect(result.current.error).toBeNull();
    expect(get).toHaveBeenCalledWith("/groups/1");
  });

  it("começa carregando", () => {
    get.mockReturnValue(new Promise(() => {}));
    const { result } = renderApiHook(() => useApiQuery(["k"], "/x"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it("traduz o erro da API para a mensagem do backend", async () => {
    get.mockRejectedValue(new ApiError(403, "Sem acesso a esta rodada."));

    const { result } = renderApiHook(() => useApiQuery(["k"], "/x"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("Sem acesso a esta rodada.");
  });

  it("erro de rede vira mensagem de conexão", async () => {
    get.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderApiHook(() => useApiQuery(["k"], "/x"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("Erro de conexão. Verifique sua internet.");
  });

  it("caminho nulo não busca nem fica carregando", () => {
    const { result } = renderApiHook(() => useApiQuery(["k"], null));

    expect(get).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it("refetch dispara nova busca", async () => {
    get.mockResolvedValue({ v: 1 });
    const { result } = renderApiHook(() => useApiQuery(["k"], "/x"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    result.current.refetch();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  describe("notFoundAsNull", () => {
    it("404 vira ausência, não erro", async () => {
      // Clube sem rodada ativa, wrapped não gerado, review não enviada.
      get.mockRejectedValue(new ApiError(404, "Nenhuma rodada ativa."));

      const { result } = renderApiHook(() =>
        useApiQuery(["k"], "/x", { notFoundAsNull: true }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("sem a opção, 404 é erro", async () => {
      get.mockRejectedValue(new ApiError(404, "Grupo não encontrado."));

      const { result } = renderApiHook(() => useApiQuery(["k"], "/x"));

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.error).toBe("Grupo não encontrado.");
    });

    it("outros erros continuam erro", async () => {
      get.mockRejectedValue(new ApiError(500, "Erro interno."));

      const { result } = renderApiHook(() =>
        useApiQuery(["k"], "/x", { notFoundAsNull: true }),
      );

      await waitFor(() => expect(result.current.error).toBe("Erro interno."));
    });
  });
});
