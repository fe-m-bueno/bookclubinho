"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import type { MeetingListItem, MeetingListResponse } from "@/lib/types/meeting";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

interface UseMeetingsOptions {
  groupId: string;
  filter?: "upcoming" | "past";
}

export function useMeetings({ groupId, filter = "upcoming" }: UseMeetingsOptions) {

  const query = useInfiniteQuery<MeetingListResponse, Error>({
    queryKey: queryKeys.meetings.list(groupId, filter),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("filter", filter);
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam as string);

      return api.get<MeetingListResponse>(
        `/groups/${groupId}/meetings?${params.toString()}`,
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const meetings = useMemo<MeetingListItem[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.meetings);
  }, [query.data]);

  // `hasUpcomingSoon` era calculado aqui, com uma janela de 48h escrita à mão e
  // nenhum consumidor. Quem pergunta é `use-meetings-badge.ts`, e quem responde
  // é o backend — duas computações independentes do mesmo conceito não tinham
  // garantia de concordar nos limites.

  return {
    meetings,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}
