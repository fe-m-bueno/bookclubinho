"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import type { MeetingListItem, MeetingListResponse } from "@/lib/types/meeting";
import { api } from "@/lib/api";

interface UseMeetingsOptions {
  groupId: string;
  filter?: "upcoming" | "past";
}

export function useMeetings({ groupId, filter = "upcoming" }: UseMeetingsOptions) {

  const query = useInfiniteQuery<MeetingListResponse, Error>({
    queryKey: ["meetings", groupId, { filter }],
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
