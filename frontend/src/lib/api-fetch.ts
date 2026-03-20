"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Fetches a JSON API endpoint with credentials.
 * Redirects to /auth/login on 401.
 * Throws on any other non-ok response.
 */
export async function apiFetch<T>(
  url: string,
  router: AppRouterInstance,
): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 401) {
    router.push("/auth/login");
    throw new Error("Não autenticado");
  }
  if (!res.ok) throw new Error(`Erro ao carregar dados (${res.status})`);
  return res.json() as Promise<T>;
}
