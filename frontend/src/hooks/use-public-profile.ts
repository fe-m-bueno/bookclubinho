"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PublicProfile } from "@/lib/types/public-profile";

export function usePublicProfile(username: string) {

  return useQuery<PublicProfile>({
    queryKey: ["publicProfile", username],
    queryFn: () =>
      api.get<PublicProfile>(`/users/by-username/${encodeURIComponent(username)}/profile`),
    staleTime: 60_000,
    enabled: !!username,
  });
}
