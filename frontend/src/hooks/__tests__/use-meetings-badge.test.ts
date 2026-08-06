import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useMeetingsBadge } from "../use-meetings-badge";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

function createWrapper(qc = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe("useMeetingsBadge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve a resposta do servidor", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ has_upcoming_soon: true });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMeetingsBadge("g1"), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/groups/g1/meetings/has-upcoming");
  });

  it("badge apagado enquanto carrega", () => {
    vi.mocked(api.get).mockResolvedValueOnce({ has_upcoming_soon: true });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMeetingsBadge("g1"), { wrapper });

    expect(result.current).toBe(false);
  });

  it("erro na requisição não derruba o layout", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("500"));
    const { qc, wrapper } = createWrapper();

    const { result } = renderHook(() => useMeetingsBadge("g1"), { wrapper });

    await waitFor(() =>
      expect(qc.getQueryState(queryKeys.meetings.badge("g1"))?.status).toBe(
        "success",
      ),
    );
    expect(result.current).toBe(false);
  });

  it("sem groupId não busca nada", () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMeetingsBadge(""), { wrapper });

    expect(api.get).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  /**
   * O acoplamento que o módulo elimina: a key era declarada dentro do
   * componente e invalidada por string literal de outro arquivo.
   */
  it("usa a key do módulo, que é a mesma que a invalidação atinge", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ has_upcoming_soon: true });
    const { qc, wrapper } = createWrapper();

    renderHook(() => useMeetingsBadge("g1"), { wrapper });

    await waitFor(() =>
      expect(qc.getQueryData(queryKeys.meetings.badge("g1"))).toBe(true),
    );
    // Prefixo do domínio, que é o que `invalidateMeetings` usa.
    expect(
      qc.getQueryCache().findAll({ queryKey: queryKeys.meetings.allBadges() }),
    ).toHaveLength(1);
  });
});
