"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type {
  QuoteResponse,
  QuoteListResponse,
  QuoteCreateRequest,
} from "@/lib/types/quote";

interface UseQuotesParams {
  groupId: string;
  sort: "votes" | "recent";
  roundId?: string | null;
}

interface UseQuotesReturn {
  quotes: QuoteResponse[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refetch: () => void;
}

export function useQuotes({
  groupId,
  sort,
  roundId,
}: UseQuotesParams): UseQuotesReturn {
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const abortRef = useRef<AbortController | null>(null);

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("sort", sort);
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (roundId) params.set("round_id", roundId);
      return `/api/v1/groups/${groupId}/quotes?${params.toString()}`;
    },
    [groupId, sort, roundId],
  );

  const fetchQuotes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setQuotes([]);
    setNextCursor(null);

    try {
      const res = await fetch(buildUrl(), {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const json: QuoteListResponse = await res.json();
        setQuotes(json.quotes);
        setNextCursor(json.next_cursor);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      setError("Erro ao carregar quotes. Tente novamente.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);

    try {
      const res = await fetch(buildUrl(nextCursor), {
        credentials: "include",
        signal: abortRef.current?.signal,
      });

      if (res.ok) {
        const json: QuoteListResponse = await res.json();
        setQuotes((prev) => [...prev, ...json.quotes]);
        setNextCursor(json.next_cursor);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoadingMore(false);
    }
  }, [buildUrl, nextCursor, loadingMore]);

  useEffect(() => {
    fetchQuotes();
    return () => abortRef.current?.abort();
  }, [fetchQuotes]);

  return {
    quotes,
    loading,
    loadingMore,
    hasMore: !!nextCursor,
    error,
    loadMore,
    refetch: fetchQuotes,
  };
}

interface UseQuoteMutationsReturn {
  createQuote: (data: QuoteCreateRequest) => Promise<QuoteResponse | null>;
  toggleVote: (quoteId: string) => Promise<boolean | null>;
  deleteQuote: (quoteId: string) => Promise<boolean>;
}

export function useQuoteMutations(groupId: string): UseQuoteMutationsReturn {
  const createQuote = useCallback(
    async (data: QuoteCreateRequest): Promise<QuoteResponse | null> => {
      try {
        await ensureCsrf();
        const res = await fetch(`/api/v1/groups/${groupId}/quotes`, {
          method: "POST",
          headers: withCsrf({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(data),
        });

        if (res.ok) {
          const quote: QuoteResponse = await res.json();
          return quote;
        }

        return null;
      } catch {
        return null;
      }
    },
    [groupId],
  );

  const toggleVote = useCallback(
    async (quoteId: string): Promise<boolean | null> => {
      try {
        await ensureCsrf();
        const res = await fetch(`/api/v1/quotes/${quoteId}/vote`, {
          method: "POST",
          headers: withCsrf({ "Content-Type": "application/json" }),
          credentials: "include",
        });

        if (res.ok) {
          const json: { voted: boolean } = await res.json();
          return json.voted;
        }

        return null;
      } catch {
        return null;
      }
    },
    [],
  );

  const deleteQuote = useCallback(async (quoteId: string): Promise<boolean> => {
    try {
      await ensureCsrf();
      const res = await fetch(`/api/v1/quotes/${quoteId}`, {
        method: "DELETE",
        headers: withCsrf(),
        credentials: "include",
      });

      return res.ok || res.status === 204;
    } catch {
      return false;
    }
  }, []);

  return { createQuote, toggleVote, deleteQuote };
}
