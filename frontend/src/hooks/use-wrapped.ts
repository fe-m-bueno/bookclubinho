"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { queryKeys } from "@/lib/query-keys";
import type { WrappedResponse } from "@/lib/types/wrapped";

interface UseWrappedReturn {
  data: WrappedResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWrapped(groupId: string, year: number): UseWrappedReturn {
  // 404 significa "ainda não gerado", não falha.
  return useApiQuery<WrappedResponse>(
    queryKeys.groups.wrapped(groupId, year),
    `/groups/${groupId}/wrapped/${year}`,
    { notFoundAsNull: true },
  );
}
