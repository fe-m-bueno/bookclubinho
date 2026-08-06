import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "@/lib/api";
import type { ChatMessage, MessageListResponse } from "@/lib/types/chat";
import { useChatMessages } from "../use-chat-messages";
import { useChatSSE } from "../use-chat-sse";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  withCredentials: boolean;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string, data = "{}") {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close() {}
}

function TestComponent() {
  const { connected } = useChatSSE({
    groupId: "group-123",
    currentUserId: "user-1",
  });

  return <span>{connected ? "online" : "offline"}</span>;
}

describe("useChatSSE", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error test shim
    globalThis.EventSource = MockEventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  it("connects through the same-origin API path", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe(
      "/api/v1/groups/group-123/chat/stream"
    );
    expect(MockEventSource.instances[0]?.withCredentials).toBe(true);
  });

  it("marks the connection as online after the connected event", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    expect(screen.getByText("offline")).toBeInTheDocument();

    act(() => {
      MockEventSource.instances[0]?.emit("connected");
    });

    expect(screen.getByText("online")).toBeInTheDocument();
  });
});

const GROUP = "group-123";
const ME = "user-1";
const OUTRO = "user-2";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    group_id: GROUP,
    round_id: null,
    author: {
      user_id: OUTRO,
      username: "outro",
      display_name: "Outro",
      avatar_url: null,
    },
    content_type: "text",
    content_text: "primeira",
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
    reference_type: null,
    reference_value: null,
    is_spoiler: false,
    spoiler_chapter: null,
    parent_message_id: null,
    reply_count: 0,
    reactions: [],
    created_at: "2026-01-01T10:00:00Z",
    updated_at: null,
    is_deleted: false,
    ...overrides,
  };
}

/** O chat de verdade: a query que monta a key e o SSE que escreve nela. */
function ChatHarness() {
  const { messages, hasNextPage, fetchNextPage } = useChatMessages({
    groupId: GROUP,
    chapterFilter: null,
  });
  useChatSSE({ groupId: GROUP, currentUserId: ME });

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            {m.is_deleted ? "[apagada]" : m.content_text} ·{" "}
            {m.reactions.map((r) => `${r.emoji}${r.count}`).join(" ")}
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>carregar mais</button>
      )}
    </div>
  );
}

/**
 * O que a #234 cobrava: o SSE não pode invalidar o infinite query.
 *
 * Cada evento invalidava a key inteira, e o React Query refetcha *todas* as
 * páginas já carregadas — dez páginas roladas viravam dez GETs por emoji, mais
 * outros dez quando o eco do próprio evento voltava pelo stream.
 */
describe("useChatSSE — escrita no cache", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    // @ts-expect-error test shim
    globalThis.EventSource = MockEventSource;
    vi.mocked(api.get).mockReset();
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  /** Duas páginas carregadas: o cenário caro do bug. */
  async function setupComDuasPaginas() {
    const paginas: Record<string, MessageListResponse> = {
      primeira: {
        messages: [makeMessage({ id: "m-2", content_text: "recente" })],
        next_cursor: "cursor-1",
      },
      antiga: {
        messages: [makeMessage({ id: "m-1", content_text: "antiga" })],
        next_cursor: null,
      },
    };

    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path.includes("cursor=") ? paginas.antiga : paginas.primeira,
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <ChatHarness />
      </QueryClientProvider>,
    );

    await screen.findByText(/recente/);
    await userEvent.click(screen.getByRole("button", { name: "carregar mais" }));
    await screen.findByText(/antiga/);

    return { invalidateSpy, paginas, requestsIniciais: vi.mocked(api.get).mock.calls.length };
  }

  function emit(type: string, data: Record<string, string>) {
    return act(async () => {
      MockEventSource.instances[0]?.emit(type, JSON.stringify(data));
    });
  }

  it("aplica reação de outro membro sem nenhuma requisição", async () => {
    const { invalidateSpy, requestsIniciais } = await setupComDuasPaginas();

    await emit("reaction_added", {
      message_id: "m-1",
      user_id: OUTRO,
      emoji: "🔥",
    });

    expect(await screen.findByText(/🔥1/)).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("desfaz a reação quando o evento é de remoção", async () => {
    const { requestsIniciais } = await setupComDuasPaginas();

    await emit("reaction_added", { message_id: "m-1", user_id: OUTRO, emoji: "🔥" });
    await screen.findByText(/🔥1/);
    await emit("reaction_removed", { message_id: "m-1", user_id: OUTRO, emoji: "🔥" });

    await waitFor(() => expect(screen.queryByText(/🔥/)).not.toBeInTheDocument());
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
  });

  it("ignora o eco dos próprios eventos — a mutação já escreveu no cache", async () => {
    const { invalidateSpy, requestsIniciais } = await setupComDuasPaginas();

    await emit("reaction_added", { message_id: "m-1", user_id: ME, emoji: "🔥" });
    await emit("message_created", { message_id: "m-9", user_id: ME });

    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("mensagem nova de outro membro busca só a primeira página", async () => {
    const { invalidateSpy, paginas, requestsIniciais } = await setupComDuasPaginas();

    paginas.primeira = {
      messages: [
        makeMessage({ id: "m-3", content_text: "chegou agora" }),
        makeMessage({ id: "m-2", content_text: "recente" }),
      ],
      next_cursor: "cursor-1",
    };

    await emit("message_created", { message_id: "m-3", user_id: OUTRO });

    expect(await screen.findByText(/chegou agora/)).toBeInTheDocument();
    // Uma requisição, sem cursor — e a página antiga continua na tela.
    const novas = vi.mocked(api.get).mock.calls.slice(requestsIniciais);
    expect(novas).toHaveLength(1);
    expect(novas[0][0]).not.toContain("cursor=");
    expect(screen.getByText(/antiga/)).toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("mensagem apagada por outro membro vira lápide sem requisição", async () => {
    const { requestsIniciais } = await setupComDuasPaginas();

    await emit("message_deleted", { message_id: "m-1", user_id: OUTRO });

    expect(await screen.findByText(/\[apagada\]/)).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
  });
});
