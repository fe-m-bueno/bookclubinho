"use client";

import { useEffect, useState } from "react";
import ReactConfetti from "react-confetti";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BadgeProgressBar } from "./badge-progress-bar";
import { fetchBadgeProgress } from "@/hooks/use-badges";
import { useWindowSize } from "@/hooks/use-window-size";
import type { BadgeResponse, BadgeProgressResponse } from "@/lib/types/badge";

interface BadgeDetailDialogProps {
  badge: BadgeResponse;
  isEarned: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  reading: "Leitura",
  social: "Social",
  streak: "Sequência",
  achievement: "Conquista",
  fun: "Diversão",
};

export function BadgeDetailDialog({
  badge,
  isEarned,
  open,
  onOpenChange,
}: BadgeDetailDialogProps) {
  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(false);
  const [progress, setProgress] = useState<BadgeProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (isEarned) {
      const seenKey = `badge-seen-${badge.slug}`;
      const alreadySeen = sessionStorage.getItem(seenKey);
      if (alreadySeen == null) {
        setShowConfetti(true);
        sessionStorage.setItem(seenKey, "1");
        const timer = setTimeout(() => setShowConfetti(false), 4000);
        return () => clearTimeout(timer);
      }
      return;
    }

    setProgress(null);
    setProgressError(null);
    setProgressLoading(true);

    fetchBadgeProgress(badge.slug)
      .then((data) => {
        setProgress(data);
      })
      .catch(() => {
        setProgressError("Não foi possível carregar o progresso.");
      })
      .finally(() => {
        setProgressLoading(false);
      });
  }, [open, isEarned, badge.slug]);

  const formattedDate =
    badge.earned_at != null
      ? format(new Date(badge.earned_at), "d 'de' MMMM 'de' yyyy", {
          locale: ptBR,
        })
      : null;

  const categoryLabel =
    CATEGORY_LABELS[badge.category] ?? badge.category;

  return (
    <>
      {showConfetti && (
        <ReactConfetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={300}
          gravity={0.25}
          style={{ position: "fixed", inset: 0, zIndex: 9999 }}
        />
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="items-center text-center gap-3 pt-2">
            <span
              className={`text-6xl leading-none select-none ${!isEarned ? "grayscale opacity-50" : ""}`}
              aria-hidden="true"
            >
              {badge.emoji ?? "🏅"}
            </span>
            <div className="space-y-1">
              <DialogTitle className="text-xl">{badge.name}</DialogTitle>
              <DialogDescription className="sr-only">
                {badge.description ?? `Conquista: ${badge.name}`}
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {categoryLabel}
            </Badge>
          </DialogHeader>

          <div className="space-y-4">
            {badge.description != null && (
              <p className="text-sm text-muted-foreground text-center">
                {badge.description}
              </p>
            )}

            {isEarned ? (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-sm">
                {formattedDate != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Conquistado em</span>
                    <span className="font-medium">{formattedDate}</span>
                  </div>
                )}
                {badge.group_name != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Grupo</span>
                    <span className="font-medium truncate max-w-[160px]">
                      {badge.group_name}
                    </span>
                  </div>
                )}
                {badge.book_title != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Livro</span>
                    <span className="font-medium truncate max-w-[160px]">
                      {badge.book_title}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Seu progresso
                </p>
                {progressLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-3 w-16 ml-auto" />
                  </div>
                )}
                {!progressLoading && progressError != null && (
                  <p className="text-sm text-muted-foreground">
                    {progressError}
                  </p>
                )}
                {!progressLoading && progress != null && (
                  <BadgeProgressBar progress={progress} />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
