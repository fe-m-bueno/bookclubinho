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

function listProps({
  messages,
  hasNextPage = false,
  fetchNextPage = vi.fn(),
  isFetchingNextPage = false,
  isLoading = false,
}: Props & { isLoading?: boolean }) {
  return (
    <MessageList
      messages={messages}
      currentUserId={ME}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      typingUsers={[]}
      viewerChapter={null}
      onDelete={vi.fn()}
      onToggleReaction={vi.fn()}
      onReply={vi.fn()}
      onEdit={vi.fn()}
    />
  );
}

function renderList(props: Props) {
  return render(listProps(props));
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

  it("abre no fim mesmo quando as mensagens chegam depois do carregamento", async () => {
    // A lista monta carregando e as mensagens chegam depois — enquanto isso o
    // container de scroll nem existe.
    const { rerender } = render(listProps({ messages: [], isLoading: true }));
    layout.flushRaf();

    rerender(listProps({ messages: makeConversation(300), isLoading: false }));
    layout.flushRaf();

    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));
    expect(mountedIds()).toContain("m-299");
  });

  it("depois que quem lê rola, o fim não sequestra mais o scroll", async () => {
    // A abertura no fim é uma fase, não um evento: o total muda enquanto as
    // linhas são medidas, e o chat se mantém colado no fim até lá (#298). O
    // risco do outro lado é uma remedição tardia trazer de volta quem já subiu
    // no histórico — o primeiro scroll que não veio da abertura encerra a fase.
    // Vale para a barra de rolagem arrastada, que não emite gesto nenhum.
    const { rerender } = renderList({
      messages: makeConversation(300),
      hasNextPage: false,
    });
    layout.flushRaf();
    await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

    layout.scrollTo(0);
    layout.flushRaf();
    await waitFor(() => expect(mountedIds()).toContain("m-0"));

    // `hasNextPage` muda o `paddingStart`, e com ele o total — a mesma classe
    // de mudança que a medição das linhas provoca.
    rerender(listProps({ messages: makeConversation(300), hasNextPage: true }));
    layout.flushRaf();

    expect(screen.getByTestId("chat-scroll").scrollTop).toBeLessThan(200);
    expect(mountedIds()).not.toContain("m-299");
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

  /**
   * #274: `virtualizer.measureElement` entra como `ref`, e o React chama ref
   * na fase de commit. Ao medir, o virtualizador reajusta o scroll e pede um
   * rerender síncrono — `flushSync` no meio do commit, que o React recusa com
   * um erro no console a cada abertura do chat.
   *
   * Note que o erro sai por `console.error` sem derrubar nada: sem esta
   * asserção, a regressão volta silenciosa.
   */
  it("não emite aviso de flushSync ao abrir a lista", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderList({ messages: makeConversation(60) });
      layout.flushRaf();
      await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

      const avisos = erro.mock.calls
        .map((args) => args.map((a) => String(a)).join(" "))
        .filter((msg) => msg.includes("flushSync"));

      expect(avisos).toEqual([]);
    } finally {
      erro.mockRestore();
    }
  });

  /**
   * O avatar e o horário passaram para a última mensagem do bloco, e
   * `isGroupEnd` olha a mensagem seguinte. Quando o mesmo autor manda outra, a
   * linha que era o fim do bloco perde os dois e encolhe — altura diferente num
   * item que o virtualizador já mediu.
   *
   * A remedição tem que acontecer pelo `ResizeObserver` do `measureElement`,
   * que é o caminho sem `flushSync` (#274). Se voltasse por lá, o aviso
   * apareceria justamente aqui: numa mudança de altura em pleno commit.
   */
  it("não emite aviso de flushSync quando a mensagem nova continua o bloco", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const base = Date.parse("2026-01-01T12:00:00.000Z");
      const doMesmoAutor = (n: number) =>
        makeMessage({
          id: `m-${n}`,
          content_text: `mensagem ${n}`,
          author: {
            user_id: "u-other",
            username: "quem",
            display_name: "Quem",
            avatar_url: null,
          },
          created_at: new Date(base + n * 60_000).toISOString(),
        });

      const conversa = Array.from({ length: 12 }, (_, i) => doMesmoAutor(i));
      const { rerender } = render(listProps({ messages: conversa }));
      layout.flushRaf();
      await waitFor(() => expect(mountedIds().length).toBeGreaterThan(0));

      rerender(listProps({ messages: [...conversa, doMesmoAutor(12)] }));
      layout.flushRaf();
      await waitFor(() => expect(mountedIds()).toContain("m-12"));

      const avisos = erro.mock.calls
        .map((args) => args.map((a) => String(a)).join(" "))
        .filter((msg) => msg.includes("flushSync"));

      expect(avisos).toEqual([]);
    } finally {
      erro.mockRestore();
    }
  });
});
