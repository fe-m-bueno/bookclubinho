"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, MessageCircle, BookOpenCheck } from "lucide-react";
import ReactConfetti from "react-confetti";
import { Button } from "@/components/ui/button";
import { RoundStatusBadge } from "./round-status-badge";
import { DeadlineCard } from "./deadline-card";
import { GroupProgress } from "./group-progress";
import { ProgressUpdateModal } from "./progress-update-modal";
import { StartReviewButton } from "./start-review-button";
import { useGroupProgress } from "@/hooks/use-group-progress";
import { useWindowSize } from "@/hooks/use-window-size";
import { useTimerStore } from "@/stores/use-timer-store";
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

  const { progress, roundStartedAt, loading: progressLoading, refetch: refetchGroupProgress } =
    useGroupProgress(round.id);

  // Current user's progress derived from group progress — single source of truth
  const myProgress = progress?.find((p) => p.user_id === group.current_user_id) ?? null;

  // Sync round context to timer store — updates on prop change and clears on unmount
  const setRoundContext = useTimerStore((s) => s.setRoundContext);
  useEffect(() => {
    setRoundContext({
      roundId: round.id,
      groupId: group.id,
      bookTitle: round.book_title,
      bookCoverUrl: round.book_cover_url,
    });
    return () => {
      useTimerStore.getState().setRoundContext(null);
    };
  }, [round.id, group.id, round.book_title, round.book_cover_url, setRoundContext]);

  const handleFinished = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);
  };

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

      {/* Group progress */}
      <GroupProgress
        progress={progress}
        currentUserId={group.current_user_id}
        roundStartedAt={roundStartedAt}
        bookPageCount={round.book_page_count}
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

      {/* Admin: Abrir Reviews */}
      {isAdmin && (
        <StartReviewButton roundId={round.id} onStarted={refetch} />
      )}

      {/* Progress update modal — key forces remount on open to sync latest progress */}
      <ProgressUpdateModal
        key={progressOpen ? "open" : "closed"}
        roundId={round.id}
        bookPageCount={round.book_page_count}
        currentPage={myProgress?.current_page ?? null}
        currentPercentage={myProgress?.percentage ?? 0}
        onUpdated={refetchGroupProgress}
        onFinished={handleFinished}
        open={progressOpen}
        onOpenChange={setProgressOpen}
      />
    </div>
  );
}
