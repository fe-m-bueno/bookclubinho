"use client";

import { useQuery } from "@tanstack/react-query";

import { getOrNull } from "@/lib/get-or-null";
import { queryKeys } from "@/lib/query-keys";
import type { RoundDetailResponse } from "@/lib/types/round";

interface UseCurrentRoundReturn {
  round: RoundDetailResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCurrentRound(groupId: string): UseCurrentRoundReturn {
  // Clube sem rodada ativa devolve 404 — é resposta legítima, não erro.
  const query = useQuery<RoundDetailResponse | null, Error>({
    queryKey: queryKeys.rounds.current(groupId),
    queryFn: () =>
      getOrNull<RoundDetailResponse>(`/groups/${groupId}/rounds/current`),
  });

  return {
    round: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
