"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { GroupDetailResponse } from "@/lib/types/group";

interface UseGroupDetailReturn {
  group: GroupDetailResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useGroupDetail(groupId: string): UseGroupDetailReturn {
  const query = useQuery<GroupDetailResponse, Error>({
    queryKey: queryKeys.groups.detail(groupId),
    queryFn: () => api.get<GroupDetailResponse>(`/groups/${groupId}`),
  });

  return {
    group: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
