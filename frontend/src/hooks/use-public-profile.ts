"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { useRouterRef } from "@/hooks/use-router-ref";
import type { PublicProfile } from "@/lib/types/public-profile";

export function usePublicProfile(username: string) {
  const routerRef = useRouterRef();

  return useQuery<PublicProfile>({
    queryKey: ["publicProfile", username],
    queryFn: () =>
      apiFetch<PublicProfile>(
        `/api/v1/users/by-username/${encodeURIComponent(username)}/profile`,
        routerRef.current,
      ),
    staleTime: 60_000,
    enabled: !!username,
  });
}
