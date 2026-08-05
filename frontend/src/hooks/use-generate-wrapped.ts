"use client";

import { useState } from "react";
import { errorMessage } from "@/hooks/use-api-query";
import { api } from "@/lib/api";
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
      return await api.post<WrappedResponse>(`/groups/${groupId}/wrapped/${year}`);
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { generate, loading, error };
}
