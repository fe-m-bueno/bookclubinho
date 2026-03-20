"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import type { UpcomingMeetingsResponse } from "@/lib/types/meeting";

export function useUpcomingMeetings(limit = 3) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  return useQuery<UpcomingMeetingsResponse, Error>({
    queryKey: ["upcomingMeetings", limit],
    queryFn: () =>
      apiFetch<UpcomingMeetingsResponse>(
        `/api/v1/meetings/upcoming?limit=${limit}`,
        routerRef.current,
      ),
    staleTime: 60_000,
  });
}
