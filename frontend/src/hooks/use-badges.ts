"use client";

import { useQuery } from "@tanstack/react-query";

import { errorMessage } from "@/hooks/use-api-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  BadgeCatalogResponse,
  BadgeProgressResponse,
  BadgeResponse,
  MyBadgesResponse,
} from "@/lib/types/badge";

interface UseBadgesReturn {
  myBadges: Record<string, BadgeResponse[]>;
  catalog: BadgeResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBadges(): UseBadgesReturn {
  // As duas chamadas seguem em paralelo, como no Promise.all que estava aqui —
  // mas agora cada uma tem sua própria chave de cache, então o catálogo (que é
  // igual para todo mundo) não é refetchado junto com as conquistas do usuário.
  const mine = useQuery<MyBadgesResponse, Error>({
    queryKey: queryKeys.badges.mine(),
    queryFn: () => api.get<MyBadgesResponse>("/users/me/badges"),
  });
  const catalog = useQuery<BadgeCatalogResponse, Error>({
    queryKey: queryKeys.badges.catalog(),
    queryFn: () => api.get<BadgeCatalogResponse>("/badges"),
    staleTime: 10 * 60_000,
  });

  return {
    myBadges: mine.data?.badges ?? {},
    catalog: catalog.data?.badges ?? [],
    loading: mine.isPending || catalog.isPending,
    error: mine.error
      ? errorMessage(mine.error)
      : catalog.error
        ? errorMessage(catalog.error)
        : null,
    refetch: () => {
      void mine.refetch();
      void catalog.refetch();
    },
  };
}

export function fetchBadgeProgress(slug: string): Promise<BadgeProgressResponse> {
  return api.get<BadgeProgressResponse>(`/badges/${slug}/progress`);
}
