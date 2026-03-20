"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { useMyReview, useReviews, useReviewStats } from "@/hooks/use-reviews";
import { BookHero } from "./book-hero";
import { RoundStatusBadge } from "./round-status-badge";
import { ReviewWizard } from "./review-wizard";
import { ReviewsList, ReviewsListSkeleton } from "./reviews-list";
import type { RoundDetailResponse } from "@/lib/types/round";

interface RoundReviewingPhaseProps {
  round: RoundDetailResponse;
  isAdmin: boolean;
  refetch: () => void;
}

export function RoundReviewingPhase({
  round,
  isAdmin,
  refetch,
}: RoundReviewingPhaseProps) {
  const { review: myReview, loading: myReviewLoading, refetch: refetchMyReview } =
    useMyReview(round.id);
  const [showAllReviews, setShowAllReviews] = useState(false);

  if (myReviewLoading) {
    return (
      <div className="space-y-6 pb-24">
        <RoundStatusBadge round={round} />
        <div className="flex flex-col items-center gap-4 pt-2">
          <Skeleton className="h-[240px] w-[160px] rounded-xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  // User hasn't submitted their review yet
  if (!myReview) {
    return (
      <div className="space-y-6 pb-24">
        <RoundStatusBadge round={round} />

        {/* Book hero */}
        <BookHero round={round} />

        {/* Review wizard */}
        <ReviewWizard
          roundId={round.id}
          onSubmitted={() => {
            refetchMyReview();
            refetch();
          }}
        />
      </div>
    );
  }

  // User has submitted — show review + optionally all reviews
  return (
    <div className="space-y-6 pb-24">
      <RoundStatusBadge round={round} />

      {/* Book hero */}
      <BookHero round={round} />

      {/* Toggle to see all reviews */}
      {!showAllReviews ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            Sua review foi enviada!
          </p>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setShowAllReviews(true)}
          >
            <Eye className="h-4 w-4" />
            Ver todas as reviews
          </Button>
        </div>
      ) : (
        <AllReviewsSection roundId={round.id} />
      )}

      {/* Admin: finish round */}
      {isAdmin && <FinishRoundButton roundId={round.id} onFinished={refetch} />}
    </div>
  );
}

function AllReviewsSection({ roundId }: { roundId: string }) {
  const { reviews, loading: reviewsLoading, error } = useReviews(roundId);
  const { stats } = useReviewStats(roundId);

  if (reviewsLoading) return <ReviewsListSkeleton />;
  if (error) {
    return (
      <p className="text-sm text-muted-foreground text-center">{error}</p>
    );
  }
  if (!reviews || reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        Nenhuma review ainda.
      </p>
    );
  }

  return <ReviewsList reviews={reviews} stats={stats} />;
}

function FinishRoundButton({
  roundId,
  onFinished,
}: {
  roundId: string;
  onFinished: () => void;
}) {
  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/finish`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Rodada encerrada!");
      onFinished();
    },
    statusHandlers: [
      {
        status: 422,
        handler: async (res) => {
          const data = await res.json();
          toast.error(data.detail || "Não é possível encerrar.");
        },
      },
      {
        status: 409,
        handler: async () => {
          toast.error("A rodada não está em fase de reviews.");
        },
      },
    ],
  });

  return (
    <div className="pt-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="default"
            className="w-full min-h-[44px]"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Encerrar Rodada"
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar rodada?</AlertDialogTitle>
            <AlertDialogDescription>
              A rodada será finalizada e não poderá ser reaberta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(JSON.stringify({}))}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
