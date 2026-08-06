"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ChatMessage, MessageListResponse } from "@/lib/types/chat";

interface UseChatMessagesOptions {
  groupId: string;
  roundId?: string | null;
  chapterFilter?: number | null;
}

export function useChatMessages({
  groupId,
  roundId,
  chapterFilter,
}: UseChatMessagesOptions) {

  const query = useInfiniteQuery<MessageListResponse, Error>({
    queryKey: queryKeys.chat.messages(groupId, { roundId, chapterFilter }),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam as string);
      if (roundId) params.set("round_id", roundId);
      if (chapterFilter != null) {
        params.set("reference_type", "chapter");
      }

      // 401/403/404 vinham com mensagem escrita à mão aqui; agora a do backend
      // chega em ApiError.detail, e o redirect do 401 é do Providers.
      return api.get<MessageListResponse>(
        `/groups/${groupId}/messages?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  // Flatten pages (API returns newest-first; reverse so oldest is at top)
  const messages = useMemo<ChatMessage[]>(() => {
    if (!query.data) return [];
    const result: ChatMessage[] = [];
    // Pages are ordered newest-first, so iterate in reverse page order
    for (let i = query.data.pages.length - 1; i >= 0; i--) {
      const page = query.data.pages[i];
      // Each page's messages are newest-first, so reverse within page
      for (let j = page.messages.length - 1; j >= 0; j--) {
        result.push(page.messages[j]);
      }
    }
    return result;
  }, [query.data]);

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}
