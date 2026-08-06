"use client";

import { useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { errorMessage } from "@/hooks/use-api-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  QuoteCreateRequest,
  QuoteListResponse,
  QuoteResponse,
} from "@/lib/types/quote";

interface UseQuotesParams {
  groupId: string;
  sort: "votes" | "recent";
  roundId?: string | null;
}

interface UseQuotesReturn {
  quotes: QuoteResponse[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refetch: () => void;
}

export function useQuotes({
  groupId,
  sort,
  roundId,
}: UseQuotesParams): UseQuotesReturn {
  // A paginação por cursor era feita à mão: `nextCursor` em estado, um
  // `loadingMore` separado e concatenação das páginas no `setQuotes`. O
  // useInfiniteQuery já é isso, e guarda as páginas por chave — voltar para uma
  // ordenação já vista não refaz o fetch.
  const query = useInfiniteQuery<QuoteListResponse, Error>({
    queryKey: queryKeys.quotes.list(groupId, { sort, roundId: roundId ?? null }),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort, limit: "20" });
      if (pageParam) params.set("cursor", pageParam as string);
      if (roundId) params.set("round_id", roundId);
      return api.get<QuoteListResponse>(
        `/groups/${groupId}/quotes?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  return {
    quotes: query.data?.pages.flatMap((p) => p.quotes) ?? [],
    loading: query.isPending,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    error: query.error ? errorMessage(query.error) : null,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    refetch: () => {
      void query.refetch();
    },
  };
}

interface UseQuoteMutationsReturn {
  createQuote: (data: QuoteCreateRequest) => Promise<QuoteResponse | null>;
  toggleVote: (quoteId: string) => Promise<boolean | null>;
  deleteQuote: (quoteId: string) => Promise<boolean>;
}

/**
 * As três engolem a falha e devolvem null/false, como antes — quem chama decide
 * o que mostrar. O que muda é que CSRF e Content-Type saem daqui: o cliente
 * decide pelo método e pelo tipo do corpo.
 */
export function useQuoteMutations(groupId: string): UseQuoteMutationsReturn {
  const createQuote = useCallback(
    async (data: QuoteCreateRequest) => {
      try {
        return await api.post<QuoteResponse>(`/groups/${groupId}/quotes`, data);
      } catch {
        return null;
      }
    },
    [groupId],
  );

  const toggleVote = useCallback(async (quoteId: string) => {
    try {
      const { voted } = await api.post<{ voted: boolean }>(
        `/quotes/${quoteId}/vote`,
      );
      return voted;
    } catch {
      return null;
    }
  }, []);

  const deleteQuote = useCallback(async (quoteId: string) => {
    try {
      await api.del(`/quotes/${quoteId}`);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { createQuote, toggleVote, deleteQuote };
}
