"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getOrNull } from "@/lib/get-or-null";
import { queryKeys } from "@/lib/query-keys";
import type { ReviewResponse, ReviewStatsResponse } from "@/lib/types/round";

interface UseMyReviewReturn {
  review: ReviewResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMyReview(roundId: string): UseMyReviewReturn {
  // 404 é "ainda não resenhou", não falha.
  const query = useQuery<ReviewResponse | null, Error>({
    queryKey: queryKeys.rounds.myReview(roundId),
    queryFn: () => getOrNull<ReviewResponse>(`/rounds/${roundId}/reviews/me`),
  });

  return {
    review: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

interface UseReviewsReturn {
  reviews: ReviewResponse[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useReviews(roundId: string): UseReviewsReturn {
  // 403 até o usuário enviar a própria review — a mensagem do backend explica.
  const query = useQuery<ReviewResponse[], Error>({
    queryKey: queryKeys.rounds.reviews(roundId),
    queryFn: () => api.get<ReviewResponse[]>(`/rounds/${roundId}/reviews`),
  });

  return {
    reviews: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

interface UseReviewStatsReturn {
  stats: ReviewStatsResponse | null;
  isLoading: boolean;
  error: Error | null;
}

export function useReviewStats(roundId: string): UseReviewStatsReturn {
  const query = useQuery<ReviewStatsResponse, Error>({
    queryKey: queryKeys.rounds.reviewStats(roundId),
    queryFn: () => api.get<ReviewStatsResponse>(`/rounds/${roundId}/reviews/stats`),
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
