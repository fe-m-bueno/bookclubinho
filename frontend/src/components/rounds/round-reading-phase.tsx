"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, MessageCircle, BookOpenCheck, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import ReactConfetti from "react-confetti";
import { Button } from "@/components/ui/button";
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
import { RoundStatusBadge } from "./round-status-badge";
import { DeadlineCard } from "./deadline-card";
import { GroupProgress } from "./group-progress";
import { UpdateProgressDrawer } from "./update-progress-drawer";
import { StartReviewButton } from "./start-review-button";
import { FloatingTimerButton } from "./floating-timer-button";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { useGroupProgress } from "@/hooks/use-group-progress";
import { useWindowSize } from "@/hooks/use-window-size";
import type { RoundDetailResponse } from "@/lib/types/round";
import type { GroupDetailResponse } from "@/lib/types/group";

interface RoundReadingPhaseProps {
  round: RoundDetailResponse;
  isAdmin: boolean;
  refetch: () => void;
  group: GroupDetailResponse;
}

export function RoundReadingPhase({
  round,
  isAdmin,
  refetch,
  group,
}: RoundReadingPhaseProps) {
  const router = useRouter();
  const { width, height } = useWindowSize();
  const [progressOpen, setProgressOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const { progress, loading: progressLoading, refetch: refetchGroupProgress } =
    useGroupProgress(round.id);

  // Current user's progress derived from group progress — single source of truth
  const myProgress = progress?.find((p) => p.user_id === group.current_user_id) ?? null;

  const { submit: submitFinish, loading: finishLoading } = useAuthSubmit({
    url: `/api/v1/rounds/${round.id}/progress`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      setShowConfetti(true);
      toast.success("Parabéns! Você terminou o livro!");
      refetchGroupProgress();
      setTimeout(() => setShowConfetti(false), 5000);
    },
  });

  return (
    <div className="space-y-6 pb-24">
      {showConfetti && (
        <ReactConfetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={250}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50, pointerEvents: "none" }}
        />
      )}

      <RoundStatusBadge round={round} />

      {/* Hero section */}
      <div className="flex flex-col items-center gap-4 pt-2">
        <div className="relative h-[240px] w-[160px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-xl">
          {round.book_cover_url ? (
            <Image
              src={round.book_cover_url}
              alt={round.book_title ?? "Capa do livro"}
              fill
              className="object-cover"
              unoptimized
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <BookOpen className="h-12 w-12" />
            </div>
          )}
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold leading-tight">
            {round.book_title}
          </h1>
          {round.book_author && (
            <p className="text-muted-foreground">{round.book_author}</p>
          )}
          {round.book_page_count && (
            <p className="text-sm text-muted-foreground">
              {round.book_page_count} páginas
            </p>
          )}
        </div>
      </div>

      {/* Deadline card */}
      {round.deadline && <DeadlineCard deadline={round.deadline} />}

      {/* Group progress — data owned here, passed down */}
      <GroupProgress
        members={group.members}
        progress={progress}
        loading={progressLoading}
      />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => setProgressOpen(true)}
        >
          <BookOpenCheck className="h-4 w-4" />
          Atualizar Progresso
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => router.push(`/groups/${group.id}/chat`)}
        >
          <MessageCircle className="h-4 w-4" />
          Abrir Chat
        </Button>
      </div>

      {/* Terminei o livro */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="default"
            className="w-full min-h-[44px]"
            disabled={(myProgress?.is_finished ?? false) || finishLoading}
          >
            <PartyPopper className="h-4 w-4" />
            {myProgress?.is_finished
              ? "Você já terminou!"
              : "Terminei o livro!"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Terminou o livro?</AlertDialogTitle>
            <AlertDialogDescription>
              Seu progresso será marcado como 100%. Parabéns!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                submitFinish(
                  JSON.stringify(
                    round.book_page_count
                      ? { current_page: round.book_page_count }
                      : { percentage: 100 },
                  ),
                )
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin: Abrir Reviews */}
      {isAdmin && (
        <StartReviewButton roundId={round.id} onStarted={refetch} />
      )}

      {/* Update progress drawer */}
      <UpdateProgressDrawer
        roundId={round.id}
        bookPageCount={round.book_page_count}
        currentPage={myProgress?.current_page ?? null}
        onUpdated={refetchGroupProgress}
        open={progressOpen}
        onOpenChange={setProgressOpen}
      />

      {/* Floating timer button */}
      <FloatingTimerButton />
    </div>
  );
}
