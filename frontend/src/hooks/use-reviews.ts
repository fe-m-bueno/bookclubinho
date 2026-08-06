"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { queryKeys } from "@/lib/query-keys";
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
    queryKeys.rounds.myReview(roundId),
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
    queryKeys.rounds.reviews(roundId),
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
    queryKeys.rounds.reviewStats(roundId),
    `/rounds/${roundId}/reviews/stats`,
  );
  return { stats: data, loading, error };
}
