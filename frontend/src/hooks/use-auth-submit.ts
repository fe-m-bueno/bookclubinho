"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface StatusHandler {
  status: number;
  handler: (res: Response) => unknown;
}

interface UseAuthSubmitOptions {
  url: string;
  method?: "POST";
  headers?: Record<string, string>;
  onSuccess: (res: Response) => unknown;
  statusHandlers?: StatusHandler[];
  antiEnumeration?: boolean;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const FORM_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
} as const;

export { JSON_HEADERS, FORM_HEADERS };

export function useAuthSubmit(options: UseAuthSubmitOptions) {
  const [loading, setLoading] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const submit = useCallback(async (body: BodyInit) => {
    const {
      url,
      method = "POST",
      headers = JSON_HEADERS,
      onSuccess,
      statusHandlers = [],
      antiEnumeration = false,
    } = optionsRef.current;

    setLoading(true);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
      });

      if (res.ok) {
        await onSuccess(res);
        return;
      }

      if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
        return;
      }

      const matched = statusHandlers.find((h) => h.status === res.status);
      if (matched) {
        await matched.handler(res);
        return;
      }

      if (antiEnumeration) {
        await onSuccess(res);
        return;
      }

      toast.error("Erro ao processar. Tente novamente.");
    } catch {
      toast.error("Erro de conexão. Verifique sua internet.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { submit, loading };
}
