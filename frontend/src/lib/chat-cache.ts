import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import { fetchChatMessagesPage, type ChatMessagesFilters } from "@/lib/chat-api";
import { queryKeys } from "@/lib/query-keys";
import type { ChatMessage, MessageListResponse } from "@/lib/types/chat";

/**
 * Cirurgia no cache do chat.
 *
 * O chat é um `useInfiniteQuery`: invalidar a key dele refetcha *todas* as
 * páginas carregadas, não a última. Num chat rolado dez páginas para cima, uma
 * reação de emoji custava dez GETs de trinta mensagens — duas vezes, porque o
 * eco do próprio evento voltava pelo SSE e invalidava de novo (#234).
 *
 * O dado necessário já está em mãos nos dois lados: as mutações recebem o
 * `ChatMessage` atualizado na resposta, e os eventos SSE trazem `message_id`,
 * `user_id` e `emoji`. Então nada aqui vai à rede — as funções editam as
 * páginas em memória.
 *
 * Tudo passa por `setQueriesData` (plural), que casa por *prefixo*: o call site
 * não precisa saber qual filtro de capítulo ou rodada está ativo, e as janelas
 * paralelas do mesmo clube são atualizadas juntas.
 */

export type ChatWindow = InfiniteData<MessageListResponse, string | undefined>;

/** Uma janela de mensagens em cache: a key exata, seus filtros e os dados. */
export interface CachedChatWindow {
  key: QueryKey;
  filters: ChatMessagesFilters;
  window: ChatWindow;
}

/**
 * Aplica `fn` a cada mensagem de cada página; `null` remove a mensagem.
 *
 * Preserva a identidade dos objetos que não mudaram — o `messages` do
 * `useChatMessages` é memoizado em cima de `data.pages`, então clonar páginas
 * intocadas re-renderizaria a lista inteira a cada evento.
 */
function mapMessages(
  window: ChatWindow,
  fn: (message: ChatMessage) => ChatMessage | null,
): ChatWindow {
  let windowChanged = false;

  const pages = window.pages.map((page) => {
    let pageChanged = false;
    const messages: ChatMessage[] = [];

    for (const message of page.messages) {
      const next = fn(message);
      if (next === message) {
        messages.push(message);
        continue;
      }
      pageChanged = true;
      if (next) messages.push(next);
    }

    if (!pageChanged) return page;
    windowChanged = true;
    return { ...page, messages };
  });

  return windowChanged ? { ...window, pages } : window;
}

function updateWindows(
  queryClient: QueryClient,
  groupId: string,
  updater: (window: ChatWindow) => ChatWindow,
): void {
  queryClient.setQueriesData<ChatWindow>(
    queryKeys.chat.ofGroup(groupId),
    (old) => (old ? updater(old) : old),
  );
}

/** Reescreve uma mensagem onde ela estiver, sem tocar em nenhuma outra. */
export function patchChatMessage(
  queryClient: QueryClient,
  groupId: string,
  messageId: string,
  patch: (previous: ChatMessage) => ChatMessage,
): void {
  updateWindows(queryClient, groupId, (window) =>
    mapMessages(window, (message) =>
      message.id === messageId ? patch(message) : message,
    ),
  );
}

/** Tira a mensagem do cache — o rollback do envio otimista. */
export function dropChatMessage(
  queryClient: QueryClient,
  groupId: string,
  messageId: string,
): void {
  updateWindows(queryClient, groupId, (window) =>
    mapMessages(window, (message) => (message.id === messageId ? null : message)),
  );
}

/** Insere a mensagem no topo da primeira página (a mais recente). */
export function prependChatMessage(
  queryClient: QueryClient,
  groupId: string,
  message: ChatMessage,
): void {
  updateWindows(queryClient, groupId, (window) => {
    if (window.pages.length === 0) return window;
    const [first, ...rest] = window.pages;
    return {
      ...window,
      pages: [{ ...first, messages: [message, ...first.messages] }, ...rest],
    };
  });
}

/**
 * Troca a mensagem otimista pela que o servidor devolveu.
 *
 * Se a versão real já entrou no cache por outro caminho — o fetch da primeira
 * página disparado pelo evento de um outro membro pode ter trazido ela junto —
 * a otimista é só descartada, para não duplicar a mensagem na tela.
 */
export function replaceChatMessage(
  queryClient: QueryClient,
  groupId: string,
  optimisticId: string,
  message: ChatMessage,
): void {
  updateWindows(queryClient, groupId, (window) => {
    const alreadyThere = window.pages.some((page) =>
      page.messages.some((m) => m.id === message.id),
    );
    return mapMessages(window, (m) => {
      if (m.id !== optimisticId) return m;
      return alreadyThere ? null : message;
    });
  });
}

/**
 * Marca a mensagem como apagada, do mesmo jeito que o backend responde:
 * o conteúdo vira `null` e só a lápide fica.
 */
export function markChatMessageDeleted(
  queryClient: QueryClient,
  groupId: string,
  messageId: string,
): void {
  patchChatMessage(queryClient, groupId, messageId, (previous) => ({
    ...previous,
    is_deleted: true,
    content_text: null,
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
  }));
}

function withReactionAdded(
  message: ChatMessage,
  emoji: string,
  mine: boolean,
): ChatMessage {
  const known = message.reactions.some((r) => r.emoji === emoji);
  if (!known) {
    return {
      ...message,
      reactions: [...message.reactions, { emoji, count: 1, did_i_react: mine }],
    };
  }
  return {
    ...message,
    reactions: message.reactions.map((r) =>
      r.emoji === emoji
        ? { ...r, count: r.count + 1, did_i_react: r.did_i_react || mine }
        : r,
    ),
  };
}

function withReactionRemoved(
  message: ChatMessage,
  emoji: string,
  mine: boolean,
): ChatMessage {
  return {
    ...message,
    reactions: message.reactions.flatMap((r) => {
      if (r.emoji !== emoji) return [r];
      const count = r.count - 1;
      if (count <= 0) return [];
      return [{ ...r, count, did_i_react: mine ? false : r.did_i_react }];
    }),
  };
}

/**
 * Reação de outro membro (ou minha, em `mine`) aplicada em memória.
 *
 * O evento SSE traz `message_id`, `user_id` e `emoji` — é tudo que a contagem
 * precisa. Nenhuma requisição de rede para mudar um emoji.
 */
export function applyCachedReaction(
  queryClient: QueryClient,
  groupId: string,
  {
    messageId,
    emoji,
    added,
    mine,
  }: { messageId: string; emoji: string; added: boolean; mine: boolean },
): void {
  patchChatMessage(queryClient, groupId, messageId, (previous) =>
    added
      ? withReactionAdded(previous, emoji, mine)
      : withReactionRemoved(previous, emoji, mine),
  );
}

/** As janelas de mensagens desse clube que já estão em cache. */
export function listChatWindows(
  queryClient: QueryClient,
  groupId: string,
): CachedChatWindow[] {
  return queryClient
    .getQueriesData<ChatWindow>(queryKeys.chat.ofGroup(groupId))
    .flatMap(([key, window]) => {
      if (!window || window.pages.length === 0) return [];
      const filters = (key[2] ?? {}) as ChatMessagesFilters;
      return [{ key, filters, window }];
    });
}

function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.updated_at === b.updated_at &&
    a.is_deleted === b.is_deleted &&
    a.content_text === b.content_text &&
    a.reply_count === b.reply_count &&
    a.reactions.length === b.reactions.length &&
    a.reactions.every((r, i) => {
      const other = b.reactions[i];
      return (
        other != null &&
        r.emoji === other.emoji &&
        r.count === other.count &&
        r.did_i_react === other.did_i_react
      );
    })
  );
}

/**
 * Costura a primeira página recém-buscada na janela que já está em cache.
 *
 * As mensagens novas entram no topo; as que já conhecíamos são atualizadas só
 * se algo mudou. As páginas antigas ficam onde estão — o ponto todo de buscar
 * uma página em vez de invalidar é não jogar fora o que o usuário já rolou.
 *
 * O `next_cursor` da página em cache é preservado de propósito: ele aponta para
 * o que vem *antes* da mensagem mais antiga da página, e prepender mensagens
 * mais novas não muda quem é a mais antiga.
 */
export function mergeChatPage(
  queryClient: QueryClient,
  key: QueryKey,
  page: MessageListResponse,
): void {
  queryClient.setQueryData<ChatWindow>(key, (old) => {
    if (!old || old.pages.length === 0) return old;

    const fresh = new Map(page.messages.map((m) => [m.id, m]));
    const known = new Set(
      old.pages.flatMap((p) => p.messages.map((m) => m.id)),
    );

    const refreshed = mapMessages(old, (message) => {
      const next = fresh.get(message.id);
      return next && !sameMessage(message, next) ? next : message;
    });

    const novas = page.messages.filter((m) => !known.has(m.id));
    if (novas.length === 0) return refreshed;

    const [first, ...rest] = refreshed.pages;
    return {
      ...refreshed,
      pages: [{ ...first, messages: [...novas, ...first.messages] }, ...rest],
    };
  });
}

/**
 * Busca a primeira página de cada janela em cache e costura o resultado.
 *
 * A única função daqui que vai à rede, e é o substituto do
 * `invalidateQueries`: um GET por janela aberta em vez de um por página
 * carregada. Se o chat estiver rolado dez páginas para cima, a diferença é
 * dez requisições contra uma.
 */
export async function syncLatestChatMessages(
  queryClient: QueryClient,
  groupId: string,
): Promise<void> {
  await Promise.all(
    listChatWindows(queryClient, groupId).map(async ({ key, filters }) => {
      const page = await fetchChatMessagesPage(groupId, filters);
      mergeChatPage(queryClient, key, page);
    }),
  );
}
