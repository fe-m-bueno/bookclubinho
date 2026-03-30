"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import type { GroupListResponse } from "@/lib/types/group";

export function useHomeGroups() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  return useQuery<GroupListResponse, Error>({
    queryKey: ["homeGroups"],
    queryFn: () => apiFetch<GroupListResponse>("/api/v1/groups/", routerRef.current),
    staleTime: 60_000,
  });
}
