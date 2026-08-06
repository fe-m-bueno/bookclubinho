"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { GroupProgressResponse, MemberProgressSummary } from "@/lib/types/round";

interface UseGroupProgressReturn {
  progress: MemberProgressSummary[] | null;
  roundStartedAt: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useGroupProgress(roundId: string): UseGroupProgressReturn {
  const query = useQuery<GroupProgressResponse, Error>({
    queryKey: queryKeys.rounds.progress(roundId),
    queryFn: () => api.get<GroupProgressResponse>(`/rounds/${roundId}/progress`),
    // O setInterval de 30s que o hook mantinha à mão: agora é o React Query que
    // agenda, e ele pausa quando a aba está em background.
    refetchInterval: 30_000,
  });

  return {
    progress: query.data?.progress ?? null,
    roundStartedAt: query.data?.round_started_at ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
