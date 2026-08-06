"use client";

import { useEffect, useState } from "react";

/**
 * O valor, atrasado — para alimentar uma query sem disparar a cada tecla.
 *
 * Três hooks de verificação (username, código de clube, busca de livro) tinham
 * o mesmo `useEffect` com `setTimeout`, `AbortController` e `useState` de
 * status, cada um com o seu jeito de cancelar a requisição anterior. Aqui só
 * mora o timer, que é uso legítimo de efeito: a busca em si vira `useQuery`
 * sobre este valor, e o cancelamento passa a ser problema do React Query.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
