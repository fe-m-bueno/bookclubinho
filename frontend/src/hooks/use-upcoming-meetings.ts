"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { UpcomingMeetingsResponse } from "@/lib/types/meeting";

export function useUpcomingMeetings(limit = 3) {

  return useQuery<UpcomingMeetingsResponse, Error>({
    queryKey: queryKeys.meetings.upcoming(limit),
    queryFn: () =>
      api.get<UpcomingMeetingsResponse>(`/meetings/upcoming?limit=${limit}`),
    staleTime: 60_000,
  });
}
