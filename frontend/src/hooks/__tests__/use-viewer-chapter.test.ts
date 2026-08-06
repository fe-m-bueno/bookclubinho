import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useViewerChapter } from "@/hooks/use-viewer-chapter";
import { renderApiHook } from "@/test-utils/query";
import type { ChatMessage } from "@/lib/types/chat";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

const ME = "u-me";

function marker(
  chapter: string | null,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `m-${chapter}-${overrides.id ?? ""}`,
    group_id: "g1",
    round_id: null,
    author: {
      user_id: ME,
      username: "eu",
      display_name: "Eu",
      avatar_url: null,
    },
    content_type: "chapter_marker",
    content_text: `Capítulo ${chapter}`,
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
    reference_type: "chapter",
    reference_value: chapter,
    is_spoiler: false,
    spoiler_chapter: null,
    parent_message_id: null,
    reply_count: 0,
    reactions: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    is_deleted: false,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("useViewerChapter", () => {
  it("busca só os marcadores de capítulo, sem carregar o chat inteiro", async () => {
    get.mockResolvedValue({ messages: [], next_cursor: null });

    renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/groups/g1/messages?reference_type=chapter&limit=50",
      ),
    );
  });

  it("usa o marcador mais recente do próprio usuário", async () => {
    // Resposta vem do mais novo para o mais antigo.
    get.mockResolvedValue({
      messages: [marker("7", { id: "novo" }), marker("2", { id: "velho" })],
      next_cursor: null,
    });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(result.current).toBe(7));
  });

  it("um capítulo menor postado depois faz o leitor voltar", async () => {
    // Quem postou "Capítulo 10" e depois "Capítulo 3" está no 3, não no 10.
    get.mockResolvedValue({
      messages: [marker("3", { id: "novo" }), marker("10", { id: "velho" })],
      next_cursor: null,
    });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(result.current).toBe(3));
  });

  it("ignora marcador de outro membro do clube", async () => {
    get.mockResolvedValue({
      messages: [
        marker("9", {
          id: "alheio",
          author: {
            user_id: "u-outro",
            username: "outra",
            display_name: "Outra",
            avatar_url: null,
          },
        }),
        marker("4", { id: "meu" }),
      ],
      next_cursor: null,
    });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(result.current).toBe(4));
  });

  it("ignora marcador apagado", async () => {
    get.mockResolvedValue({
      messages: [
        marker("9", { id: "apagado", is_deleted: true }),
        marker("4", { id: "meu" }),
      ],
      next_cursor: null,
    });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(result.current).toBe(4));
  });

  it("sem marcador nenhum, devolve null — nenhum auto-reveal", async () => {
    get.mockResolvedValue({ messages: [], next_cursor: null });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("reference_value inutilizável vira null em vez de NaN", async () => {
    get.mockResolvedValue({
      messages: [marker(null, { id: "vazio" })],
      next_cursor: null,
    });

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("erro na busca não derruba o chat — só desliga o auto-reveal", async () => {
    get.mockRejectedValue(new Error("boom"));

    const { result } = renderApiHook(() => useViewerChapter("g1", ME));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
