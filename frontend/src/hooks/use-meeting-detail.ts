"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MeetingResponse } from "@/lib/types/meeting";

export function useMeetingDetail(meetingId: string) {

  return useQuery<MeetingResponse, Error>({
    queryKey: ["meeting", meetingId],
    queryFn: () =>
      api.get<MeetingResponse>(`/meetings/${meetingId}`),
    staleTime: 30_000,
  });
}
