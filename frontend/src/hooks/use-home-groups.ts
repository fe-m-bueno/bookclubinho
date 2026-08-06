"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { GroupListResponse } from "@/lib/types/group";

export function useHomeGroups() {

  return useQuery<GroupListResponse, Error>({
    queryKey: queryKeys.groups.home(),
    queryFn: () => api.get<GroupListResponse>("/groups/"),
    staleTime: 60_000,
  });
}
