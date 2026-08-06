"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export const INVITE_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_REGEX = new RegExp(`^[${INVITE_CODE_CHARS}]{8}$`);
const DEBOUNCE_MS = 500;

export type GroupCodeStatus = "idle" | "checking" | "valid" | "not_found" | "error";

export interface ValidatedGroup {
  name: string;
  photo_url: string | null;
  member_count: number;
}

export function useGroupCodeCheck(code: string, debounceMs = DEBOUNCE_MS) {
  const debounced = useDebouncedValue(code, debounceMs);
  const valid = CODE_REGEX.test(debounced);
  const settling = code !== debounced && CODE_REGEX.test(code);

  const query = useQuery<ValidatedGroup | null, Error>({
    queryKey: queryKeys.groups.codeCheck(debounced),
    queryFn: async () => {
      try {
        return await api.get<ValidatedGroup>(`/groups/validate/${encodeURIComponent(debounced)}`);
      } catch (error) {
        // Código inexistente é resposta, não falha.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: valid,
    staleTime: 60_000,
  });

  const status: GroupCodeStatus = !CODE_REGEX.test(code)
    ? "idle"
    : settling || query.isPending
      ? "checking"
      : query.error
        ? "error"
        : query.data
          ? "valid"
          : "not_found";

  return { status, group: query.data ?? null };
}
