"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";
import type { MeetingResponse } from "@/lib/types/meeting";

export function useMeetingDetail(meetingId: string) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  return useQuery<MeetingResponse, Error>({
    queryKey: ["meeting", meetingId],
    queryFn: () =>
      apiFetch<MeetingResponse>(
        `/api/v1/meetings/${meetingId}`,
        routerRef.current,
      ),
    staleTime: 30_000,
  });
}
