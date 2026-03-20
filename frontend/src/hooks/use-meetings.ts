"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import type { MeetingListItem, MeetingListResponse } from "@/lib/types/meeting";

interface UseMeetingsOptions {
  groupId: string;
  filter?: "upcoming" | "past";
}

export function useMeetings({ groupId, filter = "upcoming" }: UseMeetingsOptions) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const query = useInfiniteQuery<MeetingListResponse, Error>({
    queryKey: ["meetings", groupId, { filter }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("filter", filter);
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam as string);

      const res = await fetch(
        `/api/v1/groups/${groupId}/meetings?${params.toString()}`,
        { credentials: "include" },
      );

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        throw new Error("Não autenticado");
      }
      if (res.status === 404) throw new Error("Grupo não encontrado");
      if (!res.ok) throw new Error("Erro ao carregar encontros");

      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const meetings = useMemo<MeetingListItem[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.meetings);
  }, [query.data]);

  const hasUpcomingSoon = useMemo(() => {
    if (filter !== "upcoming" || meetings.length === 0) return false;
    const now = Date.now();
    const in48h = now + 48 * 60 * 60 * 1000;
    return meetings.some((m) => {
      const t = new Date(m.scheduled_at).getTime();
      return t >= now && t <= in48h;
    });
  }, [meetings, filter]);

  return {
    meetings,
    hasUpcomingSoon,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}
