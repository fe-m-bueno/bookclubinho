"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserMe } from "@/lib/types/user";

export function useCurrentUser() {

  return useQuery<UserMe, Error>({
    queryKey: ["currentUser"],
    queryFn: () => api.get<UserMe>("/users/me"),
    staleTime: 60_000,
  });
}
