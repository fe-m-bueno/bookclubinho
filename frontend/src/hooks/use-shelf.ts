"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ShelfResponse } from "@/lib/types/shelf";

interface UseShelfReturn {
  data: ShelfResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useShelf(groupId: string): UseShelfReturn {
  const [data, setData] = useState<ShelfResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchShelf = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/groups/${groupId}/shelf`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const json: ShelfResponse = await res.json();
        setData(json);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      setError("Erro ao carregar a estante. Tente novamente.");
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
    fetchShelf();
    return () => abortRef.current?.abort();
  }, [fetchShelf]);

  return { data, loading, error, refetch: fetchShelf };
}
