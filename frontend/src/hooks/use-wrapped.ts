"use client";

import { useQuery } from "@tanstack/react-query";

import { getOrNull } from "@/lib/get-or-null";
import { queryKeys } from "@/lib/query-keys";
import type { WrappedResponse } from "@/lib/types/wrapped";

interface UseWrappedReturn {
  data: WrappedResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWrapped(groupId: string, year: number): UseWrappedReturn {
  // 404 significa "ainda não gerado", não falha.
  const query = useQuery<WrappedResponse | null, Error>({
    queryKey: queryKeys.groups.wrapped(groupId, year),
    queryFn: () =>
      getOrNull<WrappedResponse>(`/groups/${groupId}/wrapped/${year}`),
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
