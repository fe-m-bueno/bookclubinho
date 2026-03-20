"use client";

import { useState } from "react";
import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BadgeDetailDialog } from "./badge-detail-dialog";
import type { BadgeResponse } from "@/lib/types/badge";

interface BadgeCardProps {
  badge: BadgeResponse;
  isEarned: boolean;
  earnedAt?: string | null;
}

function isNewBadge(earnedAt: string | null | undefined): boolean {
  if (earnedAt == null) return false;
  const earnedTime = new Date(earnedAt).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() - earnedTime < oneDayMs;
}

export function BadgeCard({ badge, isEarned, earnedAt }: BadgeCardProps) {
  const [open, setOpen] = useState(false);
  const isNew = isNewBadge(earnedAt);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "relative rounded-xl p-3 flex flex-col items-center gap-1",
          "min-h-[44px] w-full cursor-pointer transition-transform active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isEarned
            ? "bg-card border border-border shadow-[0_0_12px_oklch(0.8_0.15_68)]"
            : "bg-muted/40 border border-border/50",
        ].join(" ")}
        aria-label={`${badge.name}${isEarned ? " (conquistado)" : " (bloqueado)"}`}
      >
        {isNew && (
          <span className="absolute -top-2 -right-2 z-10">
            <Badge
              variant="default"
              className="text-[10px] px-1 py-0 animate-pulse"
            >
              NOVO!
            </Badge>
          </span>
        )}

        <span
          className={[
            "text-3xl leading-none select-none relative",
            !isEarned ? "grayscale opacity-50" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          {badge.emoji ?? "🏅"}
          {!isEarned && (
            <span className="absolute inset-0 flex items-center justify-center">
              <LockIcon className="size-4 text-muted-foreground" />
            </span>
          )}
        </span>

        <span className="text-xs text-center text-foreground/80 line-clamp-2 leading-tight w-full">
          {badge.name}
        </span>
      </button>

      <BadgeDetailDialog
        badge={badge}
        isEarned={isEarned}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
