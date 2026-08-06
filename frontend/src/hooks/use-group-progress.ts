"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import type { GroupProgressResponse, MemberProgressSummary } from "@/lib/types/round";

interface UseGroupProgressReturn {
  progress: MemberProgressSummary[] | null;
  roundStartedAt: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupProgress(roundId: string): UseGroupProgressReturn {
  const { data, loading, error, refetch } = useApiQuery<GroupProgressResponse>(
    ["groupProgress", roundId],
    `/rounds/${roundId}/progress`,
    // O setInterval de 30s que o hook mantinha à mão: agora é o React Query que
    // agenda, e ele pausa quando a aba está em background.
    { refetchInterval: 30_000 },
  );

  return {
    progress: data?.progress ?? null,
    roundStartedAt: data?.round_started_at ?? null,
    loading,
    error,
    refetch,
  };
}
