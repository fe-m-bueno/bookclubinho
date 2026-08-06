"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { queryKeys } from "@/lib/query-keys";
import type { GroupStatsResponse } from "@/lib/types/stats";

interface UseGroupStatsReturn {
  data: GroupStatsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupStats(groupId: string): UseGroupStatsReturn {
  return useApiQuery<GroupStatsResponse>(
    queryKeys.groups.stats(groupId),
    `/groups/${groupId}/stats`,
  );
}
