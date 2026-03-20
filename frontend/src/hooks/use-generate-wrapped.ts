"use client";

import { useState } from "react";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type { WrappedResponse } from "@/lib/types/wrapped";

interface UseGenerateWrappedReturn {
  generate: (groupId: string, year: number) => Promise<WrappedResponse | null>;
  loading: boolean;
  error: string | null;
}

export function useGenerateWrapped(): UseGenerateWrappedReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(groupId: string, year: number): Promise<WrappedResponse | null> {
    setLoading(true);
    setError(null);
    try {
      await ensureCsrf();
      const res = await fetch(`/api/v1/groups/${groupId}/wrapped/${year}`, {
        method: "POST",
        credentials: "include",
        headers: withCsrf({ "Content-Type": "application/json" }),
      });
      if (res.ok) {
        return await res.json() as WrappedResponse;
      }
      const data = await res.json().catch(() => ({})) as { detail?: string };
      setError(data.detail ?? "Erro ao gerar o Wrapped.");
      return null;
    } catch {
      setError("Erro de conexão.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { generate, loading, error };
}
