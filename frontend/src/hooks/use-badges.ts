"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  BadgeResponse,
  BadgeCatalogResponse,
  BadgeProgressResponse,
  MyBadgesResponse,
} from "@/lib/types/badge";

interface UseBadgesReturn {
  myBadges: Record<string, BadgeResponse[]>;
  catalog: BadgeResponse[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBadges(): UseBadgesReturn {
  const [myBadges, setMyBadges] = useState<Record<string, BadgeResponse[]>>({});
  const [catalog, setCatalog] = useState<BadgeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchBadges = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const [myRes, catalogRes] = await Promise.all([
        fetch("/api/v1/users/me/badges", {
          credentials: "include",
          signal: controller.signal,
        }),
        fetch("/api/v1/badges", {
          credentials: "include",
          signal: controller.signal,
        }),
      ]);

      if (myRes.status === 401 || catalogRes.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (!myRes.ok) {
        setError("Erro ao carregar conquistas. Tente novamente.");
        return;
      }

      if (!catalogRes.ok) {
        setError("Erro ao carregar catálogo de conquistas. Tente novamente.");
        return;
      }

      const myJson: MyBadgesResponse = await myRes.json();
      const catalogJson: BadgeCatalogResponse = await catalogRes.json();

      setMyBadges(myJson.badges);
      setCatalog(catalogJson.badges);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBadges();
    return () => abortRef.current?.abort();
  }, [fetchBadges]);

  return { myBadges, catalog, loading, error, refetch: fetchBadges };
}

export async function fetchBadgeProgress(
  slug: string,
): Promise<BadgeProgressResponse> {
  const res = await fetch(`/api/v1/badges/${slug}/progress`, {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch progress for badge: ${slug}`);
  }

  return res.json() as Promise<BadgeProgressResponse>;
}
