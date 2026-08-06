"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SharedGroup } from "@/lib/types/public-profile";

export function useSharedGroups(username: string) {

  return useQuery<SharedGroup[]>({
    queryKey: ["sharedGroups", username],
    queryFn: () =>
      api.get<SharedGroup[]>(`/users/by-username/${encodeURIComponent(username)}/shared-groups`),
    staleTime: 60_000,
    enabled: !!username,
  });
}
