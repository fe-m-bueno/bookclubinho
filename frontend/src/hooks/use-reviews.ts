"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import type { ReviewResponse, ReviewStatsResponse } from "@/lib/types/round";

interface UseMyReviewReturn {
  review: ReviewResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMyReview(roundId: string): UseMyReviewReturn {
  // 404 é "ainda não resenhou", não falha.
  const { data, loading, error, refetch } = useApiQuery<ReviewResponse>(
    ["myReview", roundId],
    `/rounds/${roundId}/reviews/me`,
    { notFoundAsNull: true },
  );
  return { review: data, loading, error, refetch };
}

interface UseReviewsReturn {
  reviews: ReviewResponse[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useReviews(roundId: string): UseReviewsReturn {
  // 403 até o usuário enviar a própria review — a mensagem do backend explica.
  const { data, loading, error, refetch } = useApiQuery<ReviewResponse[]>(
    ["reviews", roundId],
    `/rounds/${roundId}/reviews`,
  );
  return { reviews: data, loading, error, refetch };
}

interface UseReviewStatsReturn {
  stats: ReviewStatsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useReviewStats(roundId: string): UseReviewStatsReturn {
  const { data, loading, error } = useApiQuery<ReviewStatsResponse>(
    ["reviewStats", roundId],
    `/rounds/${roundId}/reviews/stats`,
  );
  return { stats: data, loading, error };
}
