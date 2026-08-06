import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUsernameCheck } from "@/hooks/use-username-check";
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

describe("useUsernameCheck", () => {
  it("username inválido não chega a consultar", () => {
    const { result } = renderApiHook(() => useUsernameCheck("ab"));
    expect(result.current.status).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("mostra 'checking' enquanto o debounce não venceu", () => {
    get.mockResolvedValue({ available: true });
    const { result } = renderApiHook(() => useUsernameCheck("felipe"));
    expect(result.current.status).toBe("checking");
  });

  it("disponível", async () => {
    get.mockResolvedValue({ available: true });
    const { result } = renderApiHook(() => useUsernameCheck("felipe"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("available"));
    expect(get).toHaveBeenCalledWith("/users/check-username/felipe");
  });

  it("em uso", async () => {
    get.mockResolvedValue({ available: false });
    const { result } = renderApiHook(() => useUsernameCheck("felipe"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("taken"));
  });

  it("falha vira erro", async () => {
    get.mockRejectedValue(new ApiError(500, "Erro interno."));
    const { result } = renderApiHook(() => useUsernameCheck("felipe"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
