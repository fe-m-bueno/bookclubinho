import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { useAuthSubmit } from "../use-auth-submit";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

import { toast } from "sonner";
import { api } from "@/lib/api";

const post = api.post as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("useAuthSubmit", () => {
  it("começa com loading=false", () => {
    const { result } = renderHook(() =>
      useAuthSubmit({ path: "/test", onSuccess: vi.fn() }),
    );
    expect(result.current.loading).toBe(false);
  });

  it("passa o corpo parseado para onSuccess", async () => {
    // Antes o callback recebia uma Response e cada call site fazia
    // `await res.json()`. Nenhum usava a Response para outra coisa.
    post.mockResolvedValue({ group_id: "g-1" });
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAuthSubmit<{ group_id: string }>({ path: "/groups", onSuccess }),
    );

    await act(() => result.current.submit({ name: "Clube" }));

    expect(post).toHaveBeenCalledWith("/groups", { name: "Clube" });
    expect(onSuccess).toHaveBeenCalledWith({ group_id: "g-1" });
  });

  it("mostra toast próprio no 429, antes dos statusHandlers", async () => {
    post.mockRejectedValue(new ApiError(429, "Muitas requisições."));
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useAuthSubmit({
        path: "/test",
        onSuccess: vi.fn(),
        statusHandlers: [{ status: 429, handler }],
      }),
    );

    await act(() => result.current.submit({}));

    expect(toast.error).toHaveBeenCalledWith(
      "Muitas tentativas. Aguarde um momento.",
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("chama o handler do status, com o erro", async () => {
    const error = new ApiError(409, "Você já faz parte deste clube.");
    post.mockRejectedValue(error);
    const handler = vi.fn();
    const { result } = renderHook(() =>
      useAuthSubmit({
        path: "/groups/join",
        onSuccess: vi.fn(),
        statusHandlers: [{ status: 409, handler }],
      }),
    );

    await act(() => result.current.submit({}));

    expect(handler).toHaveBeenCalledWith(error);
  });

  it("com antiEnumeration, o caminho de sucesso roda mesmo em falha", async () => {
    // Respostas de auth precisam ser idênticas independente do erro, senão dá
    // para enumerar e-mails cadastrados.
    post.mockRejectedValue(new ApiError(404, "Usuário não encontrado."));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAuthSubmit({
        path: "/auth/magic-link",
        onSuccess,
        antiEnumeration: true,
      }),
    );

    await act(() => result.current.submit({}));

    expect(onSuccess).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sem handler, mostra a mensagem do backend", async () => {
    // O apiFetch antigo descartava o detail e mostrava "Erro ao carregar dados".
    post.mockRejectedValue(
      new ApiError(422, "Nome deve ter ao menos 2 caracteres."),
    );
    const { result } = renderHook(() =>
      useAuthSubmit({ path: "/groups", onSuccess: vi.fn() }),
    );

    await act(() => result.current.submit({}));

    expect(toast.error).toHaveBeenCalledWith(
      "Nome deve ter ao menos 2 caracteres.",
    );
  });

  it("erro que não é da API vira toast de conexão", async () => {
    post.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() =>
      useAuthSubmit({ path: "/test", onSuccess: vi.fn() }),
    );

    await act(() => result.current.submit({}));

    expect(toast.error).toHaveBeenCalledWith(
      "Erro de conexão. Verifique sua internet.",
    );
  });

  it("loading volta a false mesmo quando falha", async () => {
    post.mockRejectedValue(new ApiError(500, "Erro interno."));
    const { result } = renderHook(() =>
      useAuthSubmit({ path: "/test", onSuccess: vi.fn() }),
    );

    await act(() => result.current.submit({}));

    expect(result.current.loading).toBe(false);
  });
});
