"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
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
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const query = useInfiniteQuery<MessageListResponse, Error>({
    queryKey: ["chat-messages", groupId, { roundId, chapterFilter }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (pageParam) params.set("cursor", pageParam as string);
      if (roundId) params.set("round_id", roundId);
      if (chapterFilter != null) {
        params.set("reference_type", "chapter");
      }

      const res = await fetch(
        `/api/v1/groups/${groupId}/messages?${params.toString()}`,
        { credentials: "include" },
      );

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        throw new Error("Não autenticado");
      }
      if (res.status === 403) throw new Error("Sem acesso ao chat");
      if (res.status === 404) throw new Error("Grupo não encontrado");
      if (!res.ok) throw new Error("Erro ao carregar mensagens");

      return res.json();
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
