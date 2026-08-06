"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useRequestDataExport() {
  return useMutation({
    mutationFn: async () => {
      return api.post<{ message: string; cooldown_until: string | null }>(
        "/users/me/data-export",
      );
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (body: {
      confirmation: string;
      current_password?: string;
    }) => {
      const res = await api.del("/users/me/account", body);
    },
  });
}
