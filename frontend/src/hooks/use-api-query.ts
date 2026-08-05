"use client";

import {
  type QueryKey,
  type UseQueryOptions,
  useQuery,
} from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api";

/**
 * Leitura da API com a forma que os componentes já esperam.
 *
 * Catorze hooks tinham a mesma estrutura escrita à mão: `useState` para data,
 * loading e error, um `AbortController` num ref, e um `useEffect` disparando o
 * fetch — cerca de 50 linhas cada, com o tratamento de 401 e 403 divergindo
 * entre elas. `useState` + `useEffect` para buscar dados é o padrão que a
 * regra `client-swr-dedup` desaconselha: sem deduplicação, sem cache, e uma
 * requisição por instância montada.
 *
 * O React Query já resolvia isso e estava no projeto, usado por dez hooks. Este
 * aqui é a ponte: preserva `{ data, loading, error, refetch }` para não obrigar
 * os componentes a mudar, e traduz o erro para a mensagem que o usuário lê.
 */

export interface ApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Rede fora do ar não tem `detail`; qualquer outra coisa vem do backend. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return "Erro de conexão. Verifique sua internet.";
}

interface ApiQueryOptions<T>
  extends Omit<UseQueryOptions<T | null, Error>, "queryKey" | "queryFn" | "enabled"> {
  /**
   * Trata 404 como ausência, não como erro. Um clube sem rodada ativa devolve
   * 404 em `/rounds/current` — é uma resposta legítima, não uma falha.
   */
  notFoundAsNull?: boolean;
}

export function useApiQuery<T>(
  queryKey: QueryKey,
  /** Caminho sem `/api/v1`. `null` desabilita — para quando falta um id. */
  path: string | null,
  options: ApiQueryOptions<T> = {},
): ApiQueryResult<T> {
  const { notFoundAsNull = false, ...queryOptions } = options;

  const query = useQuery<T | null, Error>({
    queryKey,
    queryFn: async () => {
      try {
        return await api.get<T>(path as string);
      } catch (error) {
        if (notFoundAsNull && error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: path !== null,
    ...queryOptions,
  });

  return {
    data: query.data ?? null,
    // isPending é true enquanto desabilitado; sem caminho não há o que carregar.
    loading: path !== null && query.isPending,
    error: query.error ? errorMessage(query.error) : null,
    refetch: () => {
      void query.refetch();
    },
  };
}
