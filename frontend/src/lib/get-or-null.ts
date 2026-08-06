"use client";

import { ApiError, api } from "@/lib/api";

/**
 * GET em que 404 é ausência, não falha.
 *
 * Um clube sem rodada ativa, um wrapped ainda não gerado e uma review não
 * enviada respondem 404 — as três são respostas legítimas, e mostrar "não
 * encontrado" na tela seria mentir sobre o que aconteceu. Era a opção
 * `notFoundAsNull` da ponte `use-api-query`; sem a ponte, é isto.
 */
export async function getOrNull<T>(path: string): Promise<T | null> {
  try {
    return await api.get<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
