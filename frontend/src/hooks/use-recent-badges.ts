"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RecentBadgesResponse } from "@/lib/types/badge";

/**
 * `withinDays` recorta a janela em que uma conquista ainda é notícia.
 *
 * Sem ela o endpoint devolve as últimas N de qualquer época, e a home exibia
 * "Fundador · há 5 meses" para sempre, ocupando espaço permanente com um
 * evento de meio ano atrás. Passada a janela, as conquistas seguem no perfil e
 * em `/badges` — some a seção, não o dado.
 */
export function useRecentBadges(limit = 3, withinDays?: number) {
  const query =
    withinDays === undefined
      ? `?limit=${limit}`
      : `?limit=${limit}&within_days=${withinDays}`;

  return useQuery<RecentBadgesResponse, Error>({
    queryKey: queryKeys.badges.recent(limit, withinDays),
    queryFn: () =>
      api.get<RecentBadgesResponse>(`/users/me/badges/recent${query}`),
    staleTime: 120_000,
  });
}
