"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { useRouterRef } from "@/hooks/use-router-ref";
import type { HardcoverStatus } from "@/lib/types/integration";

export function useHardcoverStatus() {
  const routerRef = useRouterRef();

  return useQuery<HardcoverStatus>({
    queryKey: ["hardcoverStatus"],
    queryFn: () =>
      apiFetch<HardcoverStatus>(
        "/api/v1/integrations/hardcover/status",
        routerRef.current,
      ),
    staleTime: 60_000,
  });
}

export function useConnectHardcover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      await ensureCsrf();
      const res = await fetch("/api/v1/integrations/hardcover", {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail || "Erro ao conectar Hardcover",
        );
      }
      return res.json() as Promise<HardcoverStatus>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hardcoverStatus"] });
      qc.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });
}

export function useDisconnectHardcover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      const res = await fetch("/api/v1/integrations/hardcover", {
        method: "DELETE",
        headers: withCsrf({}),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao desconectar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hardcoverStatus"] });
      qc.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });
}

export function useToggleHardcoverSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await ensureCsrf();
      const res = await fetch("/api/v1/integrations/hardcover/sync", {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ auto_sync_hardcover: enabled }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar configuração");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currentUser"] });
    },
  });
}
