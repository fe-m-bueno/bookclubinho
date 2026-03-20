"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { useRouterRef } from "@/hooks/use-router-ref";
import type { SharedGroup } from "@/lib/types/public-profile";

export function useSharedGroups(username: string) {
  const routerRef = useRouterRef();

  return useQuery<SharedGroup[]>({
    queryKey: ["sharedGroups", username],
    queryFn: () =>
      apiFetch<SharedGroup[]>(
        `/api/v1/users/by-username/${encodeURIComponent(username)}/shared-groups`,
        routerRef.current,
      ),
    staleTime: 60_000,
    enabled: !!username,
  });
}
