"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { GroupStatsResponse } from "@/lib/types/stats";

interface UseGroupStatsReturn {
  data: GroupStatsResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useGroupStats(groupId: string): UseGroupStatsReturn {
  const query = useQuery<GroupStatsResponse, Error>({
    queryKey: queryKeys.groups.stats(groupId),
    queryFn: () => api.get<GroupStatsResponse>(`/groups/${groupId}/stats`),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
