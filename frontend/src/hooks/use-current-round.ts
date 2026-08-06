"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import type { RoundDetailResponse } from "@/lib/types/round";

interface UseCurrentRoundReturn {
  round: RoundDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCurrentRound(groupId: string): UseCurrentRoundReturn {
  // Clube sem rodada ativa devolve 404 — é resposta legítima, não erro.
  const { data, loading, error, refetch } = useApiQuery<RoundDetailResponse>(
    ["currentRound", groupId],
    `/groups/${groupId}/rounds/current`,
    { notFoundAsNull: true },
  );
  return { round: data, loading, error, refetch };
}
