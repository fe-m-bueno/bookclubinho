"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SessionListResponse } from "@/lib/types/session";

export function useSessions() {

  return useQuery<SessionListResponse>({
    queryKey: ["sessions"],
    queryFn: () =>
      api.get<SessionListResponse>("/auth/sessions"),
    staleTime: 30_000,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.del(`/auth/sessions/${sessionId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.del("/auth/sessions?all_others=true");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}
