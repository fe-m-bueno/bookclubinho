"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { queryKeys } from "@/lib/query-keys";
import type { GroupDetailResponse } from "@/lib/types/group";

interface UseGroupDetailReturn {
  group: GroupDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupDetail(groupId: string): UseGroupDetailReturn {
  const { data, loading, error, refetch } = useApiQuery<GroupDetailResponse>(
    queryKeys.groups.detail(groupId),
    `/groups/${groupId}`,
  );
  return { group: data, loading, error, refetch };
}
