"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { HardcoverStatus } from "@/lib/types/integration";

export function useHardcoverStatus() {

  return useQuery<HardcoverStatus>({
    queryKey: queryKeys.user.hardcoverStatus(),
    queryFn: () =>
      api.get<HardcoverStatus>("/integrations/hardcover/status"),
    staleTime: 60_000,
  });
}

export function useConnectHardcover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await api.post<HardcoverStatus>("/integrations/hardcover", { token });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.user.hardcoverStatus() });
      qc.invalidateQueries({ queryKey: queryKeys.user.me() });
    },
  });
}

export function useDisconnectHardcover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.del("/integrations/hardcover");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.user.hardcoverStatus() });
      qc.invalidateQueries({ queryKey: queryKeys.user.me() });
    },
  });
}

export function useToggleHardcoverSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await api.patch("/integrations/hardcover/sync", { auto_sync_hardcover: enabled });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.user.me() });
    },
  });
}
