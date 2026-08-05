import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useQuoteMutations, useQuotes } from "@/hooks/use-quotes";
import { ApiError } from "@/lib/api";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), del: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;
const post = api.post as unknown as ReturnType<typeof vi.fn>;
const del = api.del as unknown as ReturnType<typeof vi.fn>;

const page = (ids: string[], next: string | null = null) => ({
  quotes: ids.map((id) => ({ id, quote_text: `q${id}` })),
  next_cursor: next,
});

beforeEach(() => vi.clearAllMocks());

describe("useQuotes", () => {
  it("carrega a primeira página", async () => {
    get.mockResolvedValue(page(["1", "2"]));

    const { result } = renderApiHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quotes).toHaveLength(2);
    expect(get).toHaveBeenCalledWith("/groups/g1/quotes?sort=votes&limit=20");
  });

  it("hasMore reflete o cursor da última página", async () => {
    get.mockResolvedValue(page(["1"], "cur-2"));

    const { result } = renderApiHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);
  });

  it("loadMore concatena a próxima página", async () => {
    get
      .mockResolvedValueOnce(page(["1"], "cur-2"))
      .mockResolvedValueOnce(page(["2"]));

    const { result } = renderApiHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => expect(result.current.quotes).toHaveLength(1));
    result.current.loadMore();

    await waitFor(() => expect(result.current.quotes).toHaveLength(2));
    expect(get).toHaveBeenLastCalledWith(
      "/groups/g1/quotes?sort=votes&limit=20&cursor=cur-2",
    );
  });

  it("roundId entra na query quando informado", async () => {
    get.mockResolvedValue(page([]));

    renderApiHook(() => useQuotes({ groupId: "g1", sort: "recent", roundId: "r1" }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/groups/g1/quotes?sort=recent&limit=20&round_id=r1",
      ),
    );
  });

  it("erro vira a mensagem do backend", async () => {
    get.mockRejectedValue(new ApiError(403, "Sem acesso a este clube."));

    const { result } = renderApiHook(() =>
      useQuotes({ groupId: "g1", sort: "votes" }),
    );

    await waitFor(() => expect(result.current.error).toBe("Sem acesso a este clube."));
  });
});

describe("useQuoteMutations", () => {
  it("createQuote devolve a quote criada", async () => {
    const quote = { id: "q1", quote_text: "oi" };
    post.mockResolvedValue(quote);

    const { result } = renderApiHook(() => useQuoteMutations("g1"));

    await expect(
      result.current.createQuote({ quote_text: "oi" } as never),
    ).resolves.toEqual(quote);
    expect(post).toHaveBeenCalledWith("/groups/g1/quotes", { quote_text: "oi" });
  });

  it("createQuote devolve null na falha", async () => {
    post.mockRejectedValue(new ApiError(422, "Texto muito curto."));
    const { result } = renderApiHook(() => useQuoteMutations("g1"));
    await expect(result.current.createQuote({} as never)).resolves.toBeNull();
  });

  it("toggleVote devolve o novo estado", async () => {
    post.mockResolvedValue({ voted: true });
    const { result } = renderApiHook(() => useQuoteMutations("g1"));

    await expect(result.current.toggleVote("q1")).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith("/quotes/q1/vote");
  });

  it("deleteQuote devolve true no 204", async () => {
    del.mockResolvedValue(undefined);
    const { result } = renderApiHook(() => useQuoteMutations("g1"));

    await expect(result.current.deleteQuote("q1")).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith("/quotes/q1");
  });

  it("deleteQuote devolve false na falha", async () => {
    del.mockRejectedValue(new ApiError(403, "Não é sua."));
    const { result } = renderApiHook(() => useQuoteMutations("g1"));
    await expect(result.current.deleteQuote("q1")).resolves.toBe(false);
  });
});
