"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BadgeResponse } from "@/lib/types/badge";

interface RecentBadgeCardProps {
  badge: BadgeResponse;
}

export function RecentBadgeCard({ badge }: RecentBadgeCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <span className="text-2xl" role="img" aria-label={badge.name}>
        {badge.emoji ?? "🏅"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{badge.name}</p>
        {badge.earned_at && (
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(badge.earned_at), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
