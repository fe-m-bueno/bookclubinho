"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { BookResult } from "@/lib/types/book";

const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

interface UseBookSearchReturn {
  results: BookResult[];
  loading: boolean;
}

export function useBookSearch(query: string): UseBookSearchReturn {
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const enabled = debounced.length >= MIN_LENGTH;
  const settling = query !== debounced && query.length >= MIN_LENGTH;

  const search = useQuery<BookResult[], Error>({
    queryKey: queryKeys.books.search(debounced),
    queryFn: () =>
      api.get<BookResult[]>(
        `/books/search?q=${encodeURIComponent(debounced)}&limit=10`,
      ),
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    // Busca sem resultado e busca que falhou aparecem iguais para o usuário —
    // era o comportamento anterior, que engolia o erro devolvendo [].
    results: search.data ?? [],
    loading: enabled && (settling || search.isPending),
  };
}
