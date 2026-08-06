"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { ShelfResponse } from "@/lib/types/shelf";

interface UseShelfReturn {
  data: ShelfResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useShelf(groupId: string): UseShelfReturn {
  const query = useQuery<ShelfResponse, Error>({
    queryKey: queryKeys.groups.shelf(groupId),
    queryFn: () => api.get<ShelfResponse>(`/groups/${groupId}/shelf`),
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
