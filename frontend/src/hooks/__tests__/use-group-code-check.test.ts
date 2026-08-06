import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGroupCodeCheck } from "@/hooks/use-group-code-check";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const GROUP = { name: "Clube", photo_url: null, member_count: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe("useGroupCodeCheck", () => {
  it("código incompleto fica idle e não consulta", () => {
    const { result } = renderApiHook(() => useGroupCodeCheck("ABC"));
    expect(result.current.status).toBe("idle");
    expect(get).not.toHaveBeenCalled();
  });

  it("código válido devolve o grupo", async () => {
    get.mockResolvedValue(GROUP);
    const { result } = renderApiHook(() => useGroupCodeCheck("ABCD2345"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("valid"));
    expect(result.current.group).toEqual(GROUP);
    expect(get).toHaveBeenCalledWith("/groups/validate/ABCD2345");
  });

  it("código inexistente é resposta, não falha", async () => {
    get.mockRejectedValue(new ApiError(404, "Clube não encontrado."));
    const { result } = renderApiHook(() => useGroupCodeCheck("ZZZZ9999"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("not_found"));
    expect(result.current.group).toBeNull();
  });

  it("outra falha vira erro", async () => {
    get.mockRejectedValue(new ApiError(500, "Erro interno."));
    const { result } = renderApiHook(() => useGroupCodeCheck("ABCD2345"));

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
