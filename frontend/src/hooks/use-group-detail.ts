"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroupDetailResponse } from "@/lib/types/group";

interface UseGroupDetailReturn {
  group: GroupDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupDetail(groupId: string): UseGroupDetailReturn {
  const [group, setGroup] = useState<GroupDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchGroup = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/groups/${groupId}`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const data: GroupDetailResponse = await res.json();
        setGroup(data);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (res.status === 403) {
        setError("Sem acesso a este grupo.");
        return;
      }

      if (res.status === 404) {
        setError("Grupo não encontrado.");
        return;
      }

      setError("Erro ao carregar grupo. Tente novamente.");
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
    fetchGroup();
    return () => abortRef.current?.abort();
  }, [fetchGroup]);

  return { group, loading, error, refetch: fetchGroup };
}
