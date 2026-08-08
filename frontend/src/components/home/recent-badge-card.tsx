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
        {/* De que clube veio. A mesma badge é conquistada uma vez por clube, e
            sem esta linha a home mostrava "Fundador" duas vezes, em linhas
            visualmente idênticas — parecia bug de duplicata. O backend já
            mandava `group_name`; o card é que ignorava. */}
        {badge.group_name && (
          <p className="truncate text-xs text-muted-foreground">
            {badge.group_name}
          </p>
        )}
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
