"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { queryKeys } from "@/lib/query-keys";
import type { ShelfResponse } from "@/lib/types/shelf";

interface UseShelfReturn {
  data: ShelfResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useShelf(groupId: string): UseShelfReturn {
  return useApiQuery<ShelfResponse>(
    queryKeys.groups.shelf(groupId),
    `/groups/${groupId}/shelf`,
  );
}
