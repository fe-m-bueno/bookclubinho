"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WrappedResponse } from "@/lib/types/wrapped";

interface UseWrappedReturn {
  data: WrappedResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWrapped(groupId: string, year: number): UseWrappedReturn {
  const [data, setData] = useState<WrappedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchWrapped = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/groups/${groupId}/wrapped/${year}`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const json: WrappedResponse = await res.json();
        setData(json);
        return;
      }

      if (res.status === 404) {
        setData(null);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      setError("Erro ao carregar o Wrapped. Tente novamente.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [groupId, year]);

  useEffect(() => {
    fetchWrapped();
    return () => abortRef.current?.abort();
  }, [fetchWrapped]);

  return { data, loading, error, refetch: fetchWrapped };
}
