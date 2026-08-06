import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { ChatMessage, MessageListResponse } from "@/lib/types/chat";
import { useChatMessages } from "../use-chat-messages";
import {
  useDeleteMessage,
  useEditMessage,
  useSendMessage,
  useToggleReaction,
} from "../use-chat-mutations";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

const GROUP = "g-1";
const ME = "user-1";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-antiga",
    group_id: GROUP,
    round_id: null,
    author: {
      user_id: "user-2",
      username: "outro",
      display_name: "Outro",
      avatar_url: null,
    },
    content_type: "text",
    content_text: "mensagem antiga",
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
    reference_type: null,
    reference_value: null,
    is_spoiler: false,
    spoiler_chapter: null,
    parent_message_id: null,
    reply_count: 3,
    reactions: [],
    created_at: "2026-01-01T10:00:00Z",
    updated_at: null,
    is_deleted: false,
    ...overrides,
  };
}

/**
 * A key do chat é montada pelo `useChatMessages` de propósito.
 *
 * Semear o cache à mão esconderia o bug da #234: o update otimista lia e
 * escrevia `["chat-messages", groupId]` enquanto a query mora em
 * `["chat-messages", groupId, filters]`. Só quem escreve pela query real prova
 * que os dois lados combinam.
 */
function Harness() {
  const { messages } = useChatMessages({ groupId: GROUP, chapterFilter: null });
  const send = useSendMessage(GROUP, { id: ME, name: "Eu", avatar: null });
  const edit = useEditMessage();
  const remove = useDeleteMessage();
  const react = useToggleReaction();

  return (
    <div>
      <ul>
        {messages.map((m) => (
          <li key={m.id} data-testid="mensagem">
            {m.is_deleted ? "[apagada]" : m.content_text} · respostas:{" "}
            {m.reply_count} · {m.reactions.map((r) => `${r.emoji}${r.count}`).join(" ")}
          </li>
        ))}
      </ul>
      <button
        onClick={() =>
          send.mutate({ content_type: "text", content_text: "recém-enviada" })
        }
      >
        enviar
      </button>
      <button
        onClick={() =>
          edit.mutate({
            messageId: "m-antiga",
            payload: { content_text: "editada" },
          })
        }
      >
        editar
      </button>
      <button onClick={() => remove.mutate("m-antiga")}>apagar</button>
      <button
        onClick={() =>
          react.mutate({ messageId: "m-antiga", payload: { emoji: "🔥" } })
        }
      >
        reagir
      </button>
    </div>
  );
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  render(<Harness />, { wrapper });
  return { client, invalidateSpy };
}

const primeiraPagina: MessageListResponse = {
  messages: [makeMessage()],
  next_cursor: null,
};

/** Uma promise que só resolve quando o teste quiser. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("mutações do chat", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue(primeiraPagina);
    vi.mocked(api.post).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.del).mockReset();
  });

  it("mostra a mensagem enviada antes da resposta do servidor", async () => {
    const servidor = deferred<ChatMessage>();
    vi.mocked(api.post).mockReturnValue(servidor.promise);

    setup();
    await screen.findByText(/mensagem antiga/);
    const requestsIniciais = vi.mocked(api.get).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "enviar" }));

    expect(await screen.findByText(/recém-enviada/)).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);

    servidor.resolve(
      makeMessage({ id: "m-nova", content_text: "recém-enviada", reply_count: 0 }),
    );

    // A mensagem do servidor substitui a otimista — não duplica.
    await waitFor(() =>
      expect(screen.getAllByText(/recém-enviada/)).toHaveLength(1),
    );
  });

  it("desfaz a mensagem otimista quando o envio falha", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("offline"));

    setup();
    await screen.findByText(/mensagem antiga/);

    await userEvent.click(screen.getByRole("button", { name: "enviar" }));

    await waitFor(() =>
      expect(screen.queryByText(/recém-enviada/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/mensagem antiga/)).toBeInTheDocument();
  });

  it("reagir atualiza o cache sem invalidar nem refetchar página nenhuma", async () => {
    vi.mocked(api.post).mockResolvedValue(
      makeMessage({
        reactions: [{ emoji: "🔥", count: 1, did_i_react: true }],
        reply_count: 0,
      }),
    );

    const { invalidateSpy } = setup();
    await screen.findByText(/mensagem antiga/);
    const requestsIniciais = vi.mocked(api.get).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "reagir" }));

    expect(await screen.findByText(/🔥1/)).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("editar troca o texto no cache e preserva o contador de respostas", async () => {
    // O backend responde por `_reload_and_respond`, que manda reply_count=0.
    vi.mocked(api.patch).mockResolvedValue(
      makeMessage({ content_text: "editada", reply_count: 0 }),
    );

    const { invalidateSpy } = setup();
    await screen.findByText(/mensagem antiga/);
    const requestsIniciais = vi.mocked(api.get).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "editar" }));

    expect(await screen.findByText(/editada/)).toBeInTheDocument();
    expect(screen.getByTestId("mensagem")).toHaveTextContent("respostas: 3");
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("apagar deixa a lápide no cache sem invalidar", async () => {
    vi.mocked(api.del).mockResolvedValue(
      makeMessage({ is_deleted: true, content_text: null, reply_count: 0 }),
    );

    const { invalidateSpy } = setup();
    await screen.findByText(/mensagem antiga/);
    const requestsIniciais = vi.mocked(api.get).mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "apagar" }));

    expect(await screen.findByText(/\[apagada\]/)).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls).toHaveLength(requestsIniciais);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
