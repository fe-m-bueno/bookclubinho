"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { ChatMessage, TypingUser } from "@/lib/types/chat";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { ChatSkeleton } from "./chat-skeleton";
import { MessageBubble } from "./message-bubble";
import { buildMessageRows } from "./message-rows";
import { TimestampSeparator } from "./timestamp-separator";
import { ChapterMarkerCard } from "./chapter-marker-card";
import { PageMarkerCard } from "./page-marker-card";
import { TypingIndicator } from "./typing-indicator";

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  typingUsers: TypingUser[];
  /**
   * Capítulo em que o leitor está — o que revela spoiler já lido sem clique.
   * Obrigatório de propósito: o `?` que existia aqui deixou cinco componentes
   * repassarem um valor que nenhum pai fornecia, e a feature ficou desligada
   * em produção sem um erro de build.
   */
  viewerChapter: number | null;
  onDelete: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
}

export interface MessageListHandle {
  scrollToBottom: () => void;
}

/** Altura estimada de uma linha antes da primeira medição real. */
const ESTIMATED_ROW_HEIGHT = 88;
/** Espaço reservado no topo para o sentinel e o spinner de página anterior. */
const TOP_ZONE_HEIGHT = 44;
/** O `py-3` que o container tinha antes da virtualização. */
const LIST_PADDING = 12;
/** Espaçamento entre blocos de autores diferentes (era `gap-3`). */
const GROUP_GAP = 12;
/** Espaçamento dentro de um bloco do mesmo autor (era `gap-1.5`). */
const TIGHT_GAP = 6;
/** Distância do fim em que o chat ainda conta como "no fundo". */
const AT_BOTTOM_THRESHOLD = 50;

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(
  function MessageList(
    {
      messages,
      currentUserId,
      isLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      typingUsers,
      viewerChapter,
      onDelete,
      onToggleReaction,
      onReply,
      onEdit,
    },
    ref,
  ) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const didInitialScroll = useRef(false);
    /** Onde a fase de abertura deixou o scroll — ver `handleScroll`. */
    const openingScrollTop = useRef(0);
    const prevMessageCount = useRef(0);
    const prevLastMessageId = useRef<string | null>(null);
    const scrollRafRef = useRef<number | null>(null);

    const rows = useMemo(() => buildMessageRows(messages), [messages]);

    // Id e autor da última mensagem entram como escalares nas dependências do
    // efeito de auto-scroll. O array `messages` é novo a cada refetch (uma
    // reação, por exemplo) e fazia o efeito rodar sem mensagem nova nenhuma.
    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1] : null;
    const lastMessageId = lastMessage?.id ?? null;
    const lastMessageAuthorId = lastMessage?.author.user_id ?? null;

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: () => ESTIMATED_ROW_HEIGHT,
      getItemKey: (index) => rows[index].key,
      // `anchorTo: "end"` é o que segura a posição quando uma página anterior
      // entra no começo do array: o virtualizador guarda a chave do item
      // visível antes da mudança e reajusta o scroll para o mesmo lugar.
      anchorTo: "end",
      paddingStart: (hasNextPage ? TOP_ZONE_HEIGHT : 0) + LIST_PADDING,
      paddingEnd: LIST_PADDING,
      overscan: 6,
      // `measureElement` entra como `ref` lá embaixo, e o React chama ref na
      // fase de commit. Ao medir, o virtualizador reajusta o scroll e pede um
      // rerender síncrono — `flushSync` no meio do commit, que o React recusa
      // com erro no console a cada abertura do chat (#274).
      //
      // Desligar não custa nada aqui, por dois motivos. O `flushSync` que
      // dispara o aviso é justamente o que o React ignora, então a garantia
      // de sincronia que ele existe para dar já não valia nesse caminho. E no
      // caminho em que ele funciona — o ResizeObserver, quando uma imagem
      // carrega e a linha cresce — medi os dois modos com a lista fixada no
      // fim: um crescimento de 240px desloca 228px por exatamente um frame e
      // volta a zero, idêntico com e sem `flushSync`.
      useFlushSync: false,
    });

    const scrollToEnd = useCallback(() => {
      virtualizer.scrollToEnd();
    }, [virtualizer]);

    // Expose scrollToBottom to parent
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        scrollToEnd();
        useChatStore.getState().setIsAtBottom(true);
        useChatStore.getState().setUnreadCount(0);
      },
    }));

    // Track isAtBottom. As três leituras de layout são reflow síncrono, então
    // acontecem no máximo uma vez por frame — `isAtBottom` alimenta a pílula
    // de novas mensagens, não precisa de precisão de evento.
    const handleScroll = useCallback(() => {
      // Um scroll que não veio do nosso `scrollToEnd` é de quem está lendo, e
      // encerra a fase de abertura — vale para roda, toque, teclado e para a
      // barra de rolagem arrastada, que não emite gesto nenhum.
      const el0 = scrollContainerRef.current;
      if (
        el0 &&
        !didInitialScroll.current &&
        Math.abs(el0.scrollTop - openingScrollTop.current) > 1
      ) {
        didInitialScroll.current = true;
      }

      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const el = scrollContainerRef.current;
        if (!el) return;
        const atBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight <
          AT_BOTTOM_THRESHOLD;
        const store = useChatStore.getState();
        if (store.isAtBottom !== atBottom) {
          store.setIsAtBottom(atBottom);
          if (atBottom) store.setUnreadCount(0);
        }
      });
    }, []);

    useEffect(
      () => () => {
        if (scrollRafRef.current !== null) {
          cancelAnimationFrame(scrollRafRef.current);
        }
      },
      [],
    );

    // O total só é definitivo depois que as linhas são medidas: até lá ele é a
    // soma das estimativas. Como dependência do efeito abaixo, é o que faz o
    // scroll inicial acompanhar cada remedição.
    const totalSize = virtualizer.getTotalSize();

    /**
     * Abertura no fim da conversa.
     *
     * Rolar uma vez não bastava (#298). Medido no browser: o efeito rolava
     * para 537 com o total ainda estimado em 904, e a medição das linhas
     * trazia o total real (1364) logo depois, devolvendo o scroll a zero — o
     * chat abria no começo do histórico.
     *
     * Também não dá para encerrar ao "chegar no fim": logo após o primeiro
     * `scrollToEnd` o container *está* no fim do total estimado, e é
     * justamente esse fim que deixa de valer. Então a abertura é uma fase, não
     * um evento: o chat fica colado no fim enquanto o total se ajusta, e a
     * fase termina no primeiro gesto de quem lê (efeito seguinte).
     */
    useLayoutEffect(() => {
      if (isLoading || rows.length === 0 || didInitialScroll.current) return;

      const el = scrollContainerRef.current;
      if (!el) return;

      scrollToEnd();
      // Guardar onde a abertura deixou o scroll é o que permite ao
      // `handleScroll` distinguir o próximo movimento: igual a este, foi
      // nosso; diferente, foi de quem lê.
      openingScrollTop.current = el.scrollTop;
    }, [isLoading, rows.length, totalSize, scrollToEnd]);

    // Auto-scroll on new message from self
    useEffect(() => {
      const grew = messages.length > prevMessageCount.current;
      // A cauda mudar é o que distingue mensagem nova de página anterior
      // carregada: o prepend também faz a contagem crescer, e sem isso rolar
      // histórico para cima com a própria mensagem no fim jogava o leitor de
      // volta para o fundo.
      const tailChanged = lastMessageId !== prevLastMessageId.current;
      prevMessageCount.current = messages.length;
      prevLastMessageId.current = lastMessageId;

      if (!grew || !tailChanged) return;
      if (
        lastMessageAuthorId === currentUserId ||
        useChatStore.getState().isAtBottom
      ) {
        scrollToEnd();
      }
    }, [
      messages.length,
      lastMessageId,
      lastMessageAuthorId,
      currentUserId,
      scrollToEnd,
    ]);

    // Intersection observer for infinite scroll up
    useEffect(() => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        },
        {
          root: scrollContainerRef.current,
          rootMargin: "100px",
        },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const { showSkeleton } = useSkeletonState(isLoading);
    if (showSkeleton) {
      return (
        <div className="flex-1 overflow-y-auto">
          <ChatSkeleton />
        </div>
      );
    }

    const virtualRows = virtualizer.getVirtualItems();

    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        data-testid="chat-scroll"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="type-body text-inherit">Nenhuma mensagem ainda.</p>
            <p className="type-meta mt-1 text-inherit">
              Seja o primeiro a enviar!
            </p>
          </div>
        )}

        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
          data-testid="chat-virtual-container"
        >
          {/* Zona do topo: altura fixa enquanto há página anterior, para que o
              spinner aparecer ou sair não empurre a lista. */}
          {hasNextPage && (
            <div
              className="absolute inset-x-0 top-0 flex items-center justify-center"
              style={{ height: TOP_ZONE_HEIGHT }}
            >
              <div ref={sentinelRef} className="size-px" aria-hidden="true" />
              {isFetchingNextPage && (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}

          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const paddingTop =
              virtualRow.index === 0
                ? 0
                : row.isGroupStart
                  ? GROUP_GAP
                  : TIGHT_GAP;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                data-message-id={row.key}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0 px-4"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div style={{ paddingTop }}>
                  {row.separatorTimestamp && (
                    <div className="pb-3">
                      <TimestampSeparator
                        timestamp={row.separatorTimestamp}
                      />
                    </div>
                  )}
                  {row.isMarker ? (
                    row.message.content_type === "chapter_marker" ? (
                      <ChapterMarkerCard message={row.message} />
                    ) : (
                      <PageMarkerCard message={row.message} />
                    )
                  ) : (
                    <MessageBubble
                      message={row.message}
                      isOwn={row.message.author.user_id === currentUserId}
                      showAvatar={row.isGroupStart}
                      showName={row.isGroupStart}
                      currentUserId={currentUserId}
                      viewerChapter={viewerChapter}
                      onReply={onReply}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggleReaction={onToggleReaction}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Typing indicator at the bottom */}
        <TypingIndicator users={typingUsers} />
      </div>
    );
  },
);
