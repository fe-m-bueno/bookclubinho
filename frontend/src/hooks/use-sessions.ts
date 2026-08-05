"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
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
      await ensureCsrf();
      const res = await fetch(`/api/v1/auth/sessions/${sessionId}`, {
        method: "DELETE",
        headers: withCsrf({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao revogar sessão");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      const res = await fetch("/api/v1/auth/sessions?all_others=true", {
        method: "DELETE",
        headers: withCsrf({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao revogar sessões");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}
