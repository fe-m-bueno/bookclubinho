"use client";

import { useMutation } from "@tanstack/react-query";
import { ensureCsrf, withCsrf } from "@/lib/csrf";

export function useRequestDataExport() {
  return useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      const res = await fetch("/api/v1/users/me/data-export", {
        method: "POST",
        headers: withCsrf({}),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail || "Erro ao solicitar exportação",
        );
      }
      return res.json() as Promise<{
        message: string;
        cooldown_until: string | null;
      }>;
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (body: {
      confirmation: string;
      current_password?: string;
    }) => {
      await ensureCsrf();
      const res = await fetch("/api/v1/users/me/account", {
        method: "DELETE",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { detail?: string }).detail || "Erro ao excluir conta",
        );
      }
    },
  });
}
