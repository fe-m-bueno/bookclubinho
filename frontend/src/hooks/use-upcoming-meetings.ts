"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UpcomingMeetingsResponse } from "@/lib/types/meeting";

export function useUpcomingMeetings(limit = 3) {

  return useQuery<UpcomingMeetingsResponse, Error>({
    queryKey: ["upcomingMeetings", limit],
    queryFn: () =>
      api.get<UpcomingMeetingsResponse>(`/meetings/upcoming?limit=${limit}`),
    staleTime: 60_000,
  });
}
