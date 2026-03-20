"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import type { RecentBadgesResponse } from "@/lib/types/badge";

export function useRecentBadges(limit = 3) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  return useQuery<RecentBadgesResponse, Error>({
    queryKey: ["recentBadges", limit],
    queryFn: () =>
      apiFetch<RecentBadgesResponse>(
        `/api/v1/users/me/badges/recent?limit=${limit}`,
        routerRef.current,
      ),
    staleTime: 120_000,
  });
}
