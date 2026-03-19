"use client";

import { useEffect, useState } from "react";
import type { BookResult } from "@/lib/types/book";

interface UseBookSearchReturn {
  results: BookResult[];
  loading: boolean;
}

export function useBookSearch(query: string): UseBookSearchReturn {
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults((prev) => (prev.length === 0 ? prev : []));
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setLoading(true);

      fetch(
        `/api/v1/books/search?q=${encodeURIComponent(query)}&limit=10`,
        {
          credentials: "include",
          signal: controller.signal,
        },
      )
        .then((res) => {
          if (res.ok) return res.json() as Promise<BookResult[]>;
          return [] as BookResult[];
        })
        .then((data) => {
          if (!controller.signal.aborted) setResults(data);
        })
        .catch((err) => {
          if (
            !(err instanceof DOMException && err.name === "AbortError") &&
            !controller.signal.aborted
          ) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, loading };
}
