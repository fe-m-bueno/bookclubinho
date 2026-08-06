"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RecentBadgesResponse } from "@/lib/types/badge";

export function useRecentBadges(limit = 3) {

  return useQuery<RecentBadgesResponse, Error>({
    queryKey: queryKeys.badges.recent(limit),
    queryFn: () =>
      api.get<RecentBadgesResponse>(`/users/me/badges/recent?limit=${limit}`),
    staleTime: 120_000,
  });
}
