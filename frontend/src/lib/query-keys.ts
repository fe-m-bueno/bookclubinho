import type { QueryClient } from "@tanstack/react-query";

/**
 * As query keys do React Query, em um lugar.
 *
 * Antes eram literais espalhados por ~50 call sites, e a consequência não era
 * estética: a key `["meetings-badge", groupId]` estava definida dentro de um
 * `useQuery` embutido em `group-layout-shell.tsx` e era invalidada por string
 * literal de `use-meeting-mutations.ts`. Renomear um lado deixava o outro
 * invalidando uma key que não existia mais — sem erro de tipo, sem falha de
 * teste, só cache stale.
 *
 * Cada domínio expõe as keys que usa e, quando invalidação por prefixo importa,
 * o prefixo junto (`allLists`, `allDetails`, ...). React Query casa key por
 * prefixo: invalidar `["meetings"]` atinge `["meetings", g, { filter }]` de
 * qualquer grupo.
 */

/**
 * Um prefixo de key — não uma key.
 *
 * Só metade da API do React Query casa por prefixo: `invalidateQueries`,
 * `setQueriesData`, `cancelQueries` e companhia recebem *filtros* e atingem
 * toda key que comece pelo prefixo. `getQueryData`/`setQueryData` recebem uma
 * key e exigem igualdade exata.
 *
 * Passar um prefixo para os últimos compila, roda e não faz nada: foi assim que
 * o update otimista do chat ficou morto por meses (#234). `getQueryData(
 * ["chat-messages", groupId])` sempre voltava `undefined` porque a query real
 * mora em `["chat-messages", groupId, filters]`.
 *
 * Por isso um prefixo já sai daqui embalado como filtro. `{ queryKey }` é
 * aceito onde prefixo faz sentido e é erro de tipo onde não faz.
 */
export type QueryKeyPrefix<TKey extends readonly unknown[]> = {
  readonly queryKey: TKey;
};
export const queryKeys = {
  user: {
    me: () => ["currentUser"] as const,
    hardcoverStatus: () => ["hardcoverStatus"] as const,
    sessions: () => ["sessions"] as const,
    publicProfile: (username: string) => ["publicProfile", username] as const,
    sharedGroups: (username: string) => ["sharedGroups", username] as const,
    usernameCheck: (value: string) => ["usernameCheck", value] as const,
  },

  badges: {
    mine: () => ["myBadges"] as const,
    catalog: () => ["badgeCatalog"] as const,
    // A janela entra na chave: duas telas podem pedir recortes diferentes do
    // mesmo endpoint, e sem ela uma serviria o cache da outra.
    recent: (limit: number, withinDays?: number) =>
      ["recentBadges", limit, withinDays ?? null] as const,
  },

  books: {
    search: (query: string) => ["bookSearch", query] as const,
    genres: () => ["genres"] as const,
  },

  groups: {
    home: () => ["homeGroups"] as const,
    detail: (groupId: string) => ["groupDetail", groupId] as const,
    stats: (groupId: string) => ["groupStats", groupId] as const,
    shelf: (groupId: string) => ["shelf", groupId] as const,
    wrapped: (groupId: string, year: number) =>
      ["wrapped", groupId, year] as const,
    codeCheck: (code: string) => ["groupCodeCheck", code] as const,
  },

  rounds: {
    current: (groupId: string) => ["currentRound", groupId] as const,
    progress: (roundId: string) => ["groupProgress", roundId] as const,
    myReview: (roundId: string) => ["myReview", roundId] as const,
    reviews: (roundId: string) => ["reviews", roundId] as const,
    reviewStats: (roundId: string) => ["reviewStats", roundId] as const,
  },

  chat: {
    /**
     * Prefixo: toda janela de mensagens de um clube, qualquer filtro.
     *
     * Só serve para `invalidateQueries`/`setQueriesData`/`cancelQueries` — ver
     * {@link QueryKeyPrefix}.
     */
    ofGroup: (groupId: string): QueryKeyPrefix<readonly ["chat-messages", string]> => ({
      queryKey: ["chat-messages", groupId] as const,
    }),
    messages: (
      groupId: string,
      filters: { roundId?: string | null; chapterFilter?: number | null },
    ) => ["chat-messages", groupId, filters] as const,
    /**
     * Marcadores de capítulo do clube — de onde sai o capítulo do leitor.
     * Sob o prefixo `ofGroup` de propósito: mensagem nova já invalida isto.
     */
    viewerChapter: (groupId: string, userId: string) =>
      ["chat-messages", groupId, "viewer-chapter", userId] as const,
    linkPreview: (url: string) => ["link-preview", url] as const,
  },

  quotes: {
    list: (
      groupId: string,
      filters: { sort: string; roundId: string | null },
    ) => ["quotes", groupId, filters] as const,
  },

  meetings: {
    /** Prefixo: listas de encontro de qualquer clube. */
    allLists: () => ["meetings"] as const,
    list: (groupId: string, filter: string) =>
      ["meetings", groupId, { filter }] as const,

    /** Prefixo: badge de "encontro próximo" de qualquer clube. */
    allBadges: () => ["meetings-badge"] as const,
    badge: (groupId: string) => ["meetings-badge", groupId] as const,

    /** Prefixo: detalhe de qualquer encontro. */
    allDetails: () => ["meeting"] as const,
    detail: (meetingId: string) => ["meeting", meetingId] as const,

    /** Prefixo: os próximos encontros na home, qualquer limite. */
    allUpcoming: () => ["upcomingMeetings"] as const,
    upcoming: (limit: number) => ["upcomingMeetings", limit] as const,
  },
} as const;

/**
 * Algo mudou em um encontro: criado, editado, apagado, ou um RSVP.
 *
 * A mutação declara o tipo de mudança e o módulo decide o conjunto de keys —
 * é o que fecha o buraco que existia aqui. Havia dois caminhos para cada
 * operação, um dentro do clube e um `Standalone` na página do encontro, e cada
 * um invalidava justamente o que o outro esquecia. O `Standalone` não tem o
 * `groupId` no escopo: ele *não conseguia* invalidar a lista do clube nem o
 * badge do nav enquanto a key exigia o id.
 *
 * Por isso a invalidação é por prefixo, e não por instância. Só uma página de
 * clube fica montada por vez, então invalidar o domínio inteiro descarta um
 * punhado de entradas em vez de uma — e some com a divergência, em vez de
 * tentar recuperar o `groupId` no caminho que não o tem.
 */
export function invalidateMeetings(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.allLists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.allBadges() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.allDetails() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.meetings.allUpcoming() }),
  ]).then(() => undefined);
}
