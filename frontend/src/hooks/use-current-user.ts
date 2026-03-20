"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import type { UserMe } from "@/lib/types/user";

export function useCurrentUser() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  return useQuery<UserMe, Error>({
    queryKey: ["currentUser"],
    queryFn: () => apiFetch<UserMe>("/api/v1/users/me", routerRef.current),
    staleTime: 60_000,
  });
}
