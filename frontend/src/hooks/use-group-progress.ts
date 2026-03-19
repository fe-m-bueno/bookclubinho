"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  GroupProgressResponse,
  MemberProgressSummary,
} from "@/lib/types/round";

interface UseGroupProgressReturn {
  progress: MemberProgressSummary[] | null;
  roundStartedAt: string | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGroupProgress(roundId: string): UseGroupProgressReturn {
  const [progress, setProgress] = useState<MemberProgressSummary[] | null>(
    null,
  );
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchProgress = useCallback(async (isBackground = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!isBackground) setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/rounds/${roundId}/progress`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const data: GroupProgressResponse = await res.json();
        setProgress(data.progress);
        setRoundStartedAt(data.round_started_at ?? null);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (res.status === 403) {
        setError("Sem acesso ao progresso desta rodada.");
        return;
      }

      if (res.status === 404) {
        setProgress([]);
        return;
      }

      setError("Erro ao carregar progresso. Tente novamente.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [roundId]);

  useEffect(() => {
    fetchProgress();

    const intervalId = setInterval(() => {
      fetchProgress(true); // silent background refresh — no skeleton flash
    }, 30_000);

    return () => {
      clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, [fetchProgress]);

  return { progress, roundStartedAt, loading, error, refetch: fetchProgress };
}
