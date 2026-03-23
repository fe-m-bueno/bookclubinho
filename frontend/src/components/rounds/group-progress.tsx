"use client";

import { useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberProgressSummary } from "@/lib/types/round";

interface GroupProgressProps {
  progress: MemberProgressSummary[] | null;
  currentUserId: string;
  roundStartedAt: string | null;
  bookPageCount: number | null;
  loading: boolean;
}

function progressLabel(
  item: MemberProgressSummary,
  bookPageCount: number | null,
  roundStartedAt: string | null,
): string {
  if (item.is_finished) {
    if (roundStartedAt && item.updated_at) {
      const days = Math.abs(differenceInDays(parseISO(item.updated_at), parseISO(roundStartedAt)));
      return `Terminou em ${days} ${days === 1 ? "dia" : "dias"}`;
    }
    return "Terminou!";
  }
  const totalPages = item.total_pages ?? bookPageCount;
  if (item.current_page !== null && totalPages) {
    return `p. ${item.current_page}/${totalPages}`;
  }
  return `${Math.round(item.percentage)}%`;
}

function memberDisplayName(item: MemberProgressSummary): string {
  return item.display_name ?? item.username ?? "Membro";
}

function memberInitials(item: MemberProgressSummary): string {
  return memberDisplayName(item).slice(0, 2).toUpperCase();
}

export function GroupProgress({
  progress,
  currentUserId,
  roundStartedAt,
  bookPageCount,
  loading,
}: GroupProgressProps) {
  const shouldReduce = useReducedMotion();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const myPercentage =
    progress?.find((p) => p.user_id === currentUserId)?.percentage ?? 0;

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Progresso do Grupo
        </h2>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-10 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const allZero =
    !progress ||
    progress.every((p) => p.percentage === 0 && !p.is_finished);

  if (allZero) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Progresso do Grupo
        </h2>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Ninguém começou ainda</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">
        Progresso do Grupo
      </h2>
      <div className="space-y-4">
        {(progress ?? []).map((item, index) => {
          const isAhead =
            item.user_id !== currentUserId &&
            item.percentage > myPercentage &&
            !!item.note;
          const isRevealed = revealed.has(item.user_id);
          const label = progressLabel(item, bookPageCount, roundStartedAt);

          return (
            <motion.div
              key={item.user_id}
              initial={shouldReduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: shouldReduce ? 0 : 0.05 * index,
                duration: 0.2,
              }}
              className="space-y-1"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  {item.avatar_url && (
                    <AvatarImage
                      src={item.avatar_url}
                      alt={memberDisplayName(item)}
                    />
                  )}
                  <AvatarFallback className="text-xs">
                    {memberInitials(item)}
                  </AvatarFallback>
                </Avatar>

                {/* Name + streak + bar */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate leading-none">
                      {memberDisplayName(item)}
                    </p>
                    {item.streak_current > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-xs py-0 px-1.5 shrink-0"
                      >
                        🔥 {item.streak_current}
                      </Badge>
                    )}
                  </div>

                  {/* Bar + Label row */}
                  <div className="flex items-center gap-3">
                    {/* Gradient progress bar */}
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-sage-200/30 dark:bg-sage-800/30">
                      <motion.div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sage-300 to-sage-500"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, item.percentage)}%`,
                        }}
                        transition={
                          shouldReduce
                            ? { duration: 0 }
                            : {
                                type: "spring",
                                stiffness: 350,
                                damping: 30,
                              }
                        }
                      />
                    </div>

                    {/* Label */}
                    <div className="shrink-0">
                      {item.is_finished ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[--color-sage-100] text-[--color-sage-700] dark:bg-[--color-sage-900] dark:text-[--color-sage-300]">
                          <CheckCircle2 className="size-3 shrink-0" />
                          {label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Note (blurred se spoiler) */}
              {item.note && (
                <div className="ml-11 relative">
                  {isAhead && !isRevealed ? (
                    <button
                      onClick={() =>
                        setRevealed(
                          (prev) => new Set([...prev, item.user_id]),
                        )
                      }
                      className="w-full text-left"
                      aria-label="Revelar nota"
                    >
                      <p className="text-xs text-muted-foreground italic blur-sm select-none">
                        {item.note}
                      </p>
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                        Toque para revelar
                      </span>
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      &ldquo;{item.note}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
