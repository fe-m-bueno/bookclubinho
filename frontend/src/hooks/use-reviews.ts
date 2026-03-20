"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResponse, ReviewStatsResponse } from "@/lib/types/round";

interface UseMyReviewReturn {
  review: ReviewResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyReview(roundId: string): UseMyReviewReturn {
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchReview = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/rounds/${roundId}/reviews/me`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const data: ReviewResponse = await res.json();
        setReview(data);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (res.status === 404) {
        setReview(null);
        return;
      }

      setError("Erro ao carregar review.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [roundId]);

  useEffect(() => {
    fetchReview();
    return () => abortRef.current?.abort();
  }, [fetchReview]);

  return { review, loading, error, refetch: fetchReview };
}

interface UseReviewsReturn {
  reviews: ReviewResponse[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useReviews(roundId: string): UseReviewsReturn {
  const [reviews, setReviews] = useState<ReviewResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const abortRef = useRef<AbortController | null>(null);

  const fetchReviews = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/rounds/${roundId}/reviews`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const data: ReviewResponse[] = await res.json();
        setReviews(data);
        return;
      }

      if (res.status === 401) {
        routerRef.current.push("/auth/login");
        return;
      }

      if (res.status === 403) {
        setError("Envie sua review primeiro!");
        return;
      }

      setError("Erro ao carregar reviews.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [roundId]);

  useEffect(() => {
    fetchReviews();
    return () => abortRef.current?.abort();
  }, [fetchReviews]);

  return { reviews, loading, error, refetch: fetchReviews };
}

interface UseReviewStatsReturn {
  stats: ReviewStatsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useReviewStats(roundId: string): UseReviewStatsReturn {
  const [stats, setStats] = useState<ReviewStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/rounds/${roundId}/reviews/stats`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (res.ok) {
        const data: ReviewStatsResponse = await res.json();
        setStats(data);
        return;
      }

      if (res.status === 403) {
        setStats(null);
        return;
      }

      setError("Erro ao carregar estatísticas.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erro de conexão.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [roundId]);

  useEffect(() => {
    fetchStats();
    return () => abortRef.current?.abort();
  }, [fetchStats]);

  return { stats, loading, error };
}
