"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api";

interface StatusHandler {
  status: number;
  handler: (error: ApiError) => unknown;
}

interface UseAuthSubmitOptions<T> {
  /** Caminho sem o prefixo `/api/v1` — o cliente o adiciona. */
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  onSuccess: (body: T) => unknown;
  /**
   * Roda depois de qualquer falha — inclusive as que só viram toast.
   *
   * Existe para desfazer estado otimista que o `loading` do hook não cobre:
   * quem troca o rótulo de um botão no clique precisa de onde devolvê-lo se a
   * request não passar. Não roda no caminho `antiEnumeration`, onde a falha é
   * deliberadamente indistinguível do sucesso.
   */
  onError?: () => unknown;
  statusHandlers?: StatusHandler[];
  antiEnumeration?: boolean;
}

/**
 * Submissão de formulário com tratamento de erro por status.
 *
 * Passou a falar com `lib/api` em vez de com `fetch` direto, o que tirou daqui o
 * `ensureCsrf`/`withCsrf` e os `JSON_HEADERS`/`FORM_HEADERS`. Os callbacks
 * recebem o corpo já parseado em vez de uma `Response`: nenhum dos 22 call sites
 * usava a Response para outra coisa além de `await res.json()`, então dez deles
 * perderam essa linha e doze não mudaram nada.
 */
export function useAuthSubmit<T = unknown>(options: UseAuthSubmitOptions<T>) {
  const [loading, setLoading] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const submit = useCallback(async (body?: unknown) => {
    const {
      path,
      method = "POST",
      onSuccess,
      onError,
      statusHandlers = [],
      antiEnumeration = false,
    } = optionsRef.current;

    // O catch tem quatro saídas antecipadas, e todas passam pelo `finally` —
    // que é onde o aviso de falha sai, uma vez só, sem repetir a chamada em
    // cada `return`.
    let falhou = false;

    setLoading(true);
    try {
      const result =
        method === "POST"
          ? await api.post<T>(path, body as never)
          : method === "PATCH"
            ? await api.patch<T>(path, body as never)
            : await api.del<T>(path, body as never);
      await onSuccess(result);
    } catch (error) {
      falhou = true;

      if (!(error instanceof ApiError)) {
        toast.error("Erro de conexão. Verifique sua internet.");
        return;
      }

      if (error.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
        return;
      }

      const matched = statusHandlers.find((h) => h.status === error.status);
      if (matched) {
        await matched.handler(error);
        return;
      }

      // Respostas de auth são idênticas independente do erro, para não permitir
      // enumeração de e-mail — então o caminho de sucesso roda mesmo em falha.
      if (antiEnumeration) {
        falhou = false;
        await onSuccess(undefined as T);
        return;
      }

      toast.error(error.detail);
    } finally {
      setLoading(false);
      if (falhou) await onError?.();
    }
  }, []);

  return { submit, loading };
}
