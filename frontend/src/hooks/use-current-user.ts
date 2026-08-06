"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { UserMe } from "@/lib/types/user";

export function useCurrentUser() {

  return useQuery<UserMe, Error>({
    queryKey: queryKeys.user.me(),
    queryFn: () => api.get<UserMe>("/users/me"),
    staleTime: 60_000,
  });
}
