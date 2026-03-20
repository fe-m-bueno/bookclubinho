"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroupStatsResponse } from "@/lib/types/stats";

interface UseGroupStatsReturn {
  data: GroupStatsResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupStats(groupId: string): UseGroupStatsReturn {
  const [data, setData] = useState<GroupStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/groups/${groupId}/stats`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const json: GroupStatsResponse = await res.json();
        setData(json);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      setError("Erro ao carregar as estatísticas. Tente novamente.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [groupId]);

  useEffect(() => {
    fetchStats();
    return () => abortRef.current?.abort();
  }, [fetchStats]);

  return { data, loading, error, refetch: fetchStats };
}
