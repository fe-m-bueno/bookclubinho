import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion");

import { MessageList } from "../message-list";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage } from "@/lib/types/chat";
import { makeMessage } from "./helpers";
import {
  installVirtualLayout,
  screenTopOf,
  VIEWPORT_HEIGHT,
  type VirtualLayoutHarness,
} from "./virtual-layout-harness";

const ME = "u-me";

/** Mensagens em ordem cronológica, espaçadas 1 min — sem separador entre elas. */
function makeConversation(count: number, startAt = 0): ChatMessage[] {
  const base = Date.parse("2026-01-01T12:00:00.000Z");
  return Array.from({ length: count }, (_, i) => {
    const n = startAt + i;
    return makeMessage({
      id: `m-${n}`,
      content_text: `mensagem ${n}`,
      author: {
        user_id: n % 2 === 0 ? ME : "u-other",
        username: "quem",
        display_name: "Quem",
        avatar_url: null,
      },
      created_at: new Date(base + n * 60_000).toISOString(),
    });
  });
}

interface Props {
  messages: ChatMessage[];
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
}

function renderList({
  messages,
  hasNextPage = false,
  fetchNextPage = vi.fn(),
  isFetchingNextPage = false,
}: Props) {
  return render(
    <MessageList
      messages={messages}
      currentUserId={ME}
      isLoading={false}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      typingUsers={[]}
      viewerChapter={null}
      onDelete={vi.fn()}
      onToggleReaction={vi.fn()}
      onReply={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
}

function mountedIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-message-id]"),
  ).map((el) => el.dataset.messageId!);
}

let layout: VirtualLayoutHarness;

beforeEach(() => {
  useChatStore.getState().reset();
  layout = installVirtualLayout();
});

afterEach(() => {
  layout.restore();
  vi.clearAllMocks();
});

describe("MessageList virtualizada", () => {
  it("monta só uma fração das mensagens carregadas", async () => {
    // 300 mensagens é o que dez páginas de 30 produzem depois de rolar o
    // histórico — o caso que antes montava 300 bolhas de uma vez.
    renderList({ messages: makeConversation(300) });
    layout.flushRaf();

    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    const montadas = mountedIds().length;
    expect(montadas).toBeLessThan(40);
    // E o que está montado é o fim da conversa, que é onde o chat abre.
    expect(mountedIds()).toContain("m-299");
  });

  it("não salta de posição quando uma página anterior entra no começo", async () => {
    // Este é o risco da virtualização: as 30 mensagens mais antigas entram no
    // topo do array e empurrariam tudo para baixo se o virtualizador não
    // ancorasse pela chave do item visível.
    const { rerender } = renderList({
      messages: makeConversation(60, 30),
      hasNextPage: true,
    });
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    // Sobe um pouco, para não estar colado no fim (onde ancorar é trivial).
    layout.scrollTo(600);
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    const ancora = mountedIds()[Math.floor(mountedIds().length / 2)];
    const antes = screenTopOf(ancora);

    rerender(
      <MessageList
        messages={makeConversation(90, 0)}
        currentUserId={ME}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        fetchNextPage={vi.fn()}
        typingUsers={[]}
        viewerChapter={null}
        onDelete={vi.fn()}
        onToggleReaction={vi.fn()}
        onReply={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    layout.flushRaf();

    await waitFor(() => expect(mountedIds()).toContain(ancora));

    // A mesma mensagem continua no mesmo lugar da tela, com folga de um item.
    expect(Math.abs(screenTopOf(ancora) - antes)).toBeLessThan(VIEWPORT_HEIGHT / 2);
  });

  it("mede o layout no máximo uma vez por frame durante o scroll", async () => {
    renderList({ messages: makeConversation(120) });
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    layout.resetLayoutReads();

    // Dez eventos de scroll dentro do mesmo frame — o que um gesto de dedo
    // produz. Sem o rAF, `handleScroll` mediria layout dez vezes.
    for (let i = 1; i <= 10; i++) {
      const el = document.querySelector('[data-testid="chat-scroll"]')!;
      el.scrollTop = i * 40;
      el.dispatchEvent(new Event("scroll"));
    }
    const durante = layout.layoutReads();
    layout.flushRaf(1);
    const depoisDoFrame = layout.layoutReads();

    // O handler acumulou um único rAF; a medição dele só acontece no flush.
    expect(depoisDoFrame).toBeGreaterThan(durante);
    // E dez eventos não podem custar dez medições do handler (2 leituras cada).
    expect(depoisDoFrame - durante).toBeLessThan(10);
  });

  it("pede a página anterior quando a sentinela do topo aparece", async () => {
    const fetchNextPage = vi.fn();
    renderList({
      messages: makeConversation(60),
      hasNextPage: true,
      fetchNextPage,
    });
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    layout.triggerIntersection(true);

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));
  });

  it("não pede página anterior enquanto uma busca está em curso", async () => {
    const fetchNextPage = vi.fn();
    renderList({
      messages: makeConversation(60),
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage,
    });
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    layout.triggerIntersection(true);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("mostra o estado vazio quando não há mensagem nenhuma", async () => {
    renderList({ messages: [] });
    layout.flushRaf();

    expect(await screen.findByText("Nenhuma mensagem ainda.")).toBeInTheDocument();
    expect(mountedIds()).toHaveLength(0);
  });
});
