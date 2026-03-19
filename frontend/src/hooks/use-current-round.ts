"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoundDetailResponse } from "@/lib/types/round";

interface UseCurrentRoundReturn {
  round: RoundDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCurrentRound(groupId: string): UseCurrentRoundReturn {
  const [round, setRound] = useState<RoundDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchRound = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/v1/groups/${groupId}/rounds/current`,
        {
          credentials: "include",
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const data: RoundDetailResponse = await res.json();
        setRound(data);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (res.status === 403) {
        setError("Sem acesso a esta rodada.");
        return;
      }

      if (res.status === 404) {
        setRound(null);
        return;
      }

      setError("Erro ao carregar rodada. Tente novamente.");
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
    fetchRound();
    return () => abortRef.current?.abort();
  }, [fetchRound]);

  return { round, loading, error, refetch: fetchRound };
}
