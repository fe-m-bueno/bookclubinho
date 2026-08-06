"use client";

import { useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api";

export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const DEBOUNCE_MS = 500;

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

export function useUsernameCheck(username: string) {
  const debounced = useDebouncedValue(username, DEBOUNCE_MS);
  const valid = USERNAME_REGEX.test(debounced);
  // O usuário ainda está digitando quando o valor atrasado não alcançou.
  const settling = username !== debounced && USERNAME_REGEX.test(username);

  const query = useQuery<{ available: boolean }, Error>({
    queryKey: ["usernameCheck", debounced],
    queryFn: () =>
      api.get<{ available: boolean }>(
        `/users/check-username/${encodeURIComponent(debounced)}`,
      ),
    enabled: valid,
    staleTime: 60_000,
  });

  const status: UsernameStatus = !USERNAME_REGEX.test(username)
    ? "idle"
    : settling || query.isPending
      ? "checking"
      : query.error
        ? "error"
        : query.data?.available
          ? "available"
          : "taken";

  return { status };
}
