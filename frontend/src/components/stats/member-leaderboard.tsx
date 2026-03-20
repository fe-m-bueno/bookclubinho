"use client";

import { useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MemberLeaderboardEntry } from "@/lib/types/stats";

interface MemberLeaderboardProps {
  members: MemberLeaderboardEntry[];
}

type SortKey = "books_finished" | "avg_rating" | "current_streak" | "reading_time_minutes";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "books_finished", label: "Livros" },
  { key: "avg_rating", label: "Nota" },
  { key: "current_streak", label: "Streak" },
  { key: "reading_time_minutes", label: "Tempo" },
];

function getInitials(entry: MemberLeaderboardEntry): string {
  return (entry.display_name || entry.username || "?").slice(0, 2).toUpperCase();
}

function formatReadingTime(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) return `${minutes}m`;
  return `${hours.toFixed(1)}h`;
}

export function MemberLeaderboard({ members }: MemberLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("books_finished");

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      if (sortKey === "avg_rating") {
        const aVal = a.avg_rating ?? -1;
        const bVal = b.avg_rating ?? -1;
        return bVal - aVal;
      }
      return b[sortKey] - a[sortKey];
    });
  }, [members, sortKey]);

  if (members.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking de membros</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum membro ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking de membros</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          {SORT_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant={sortKey === opt.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSortKey(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((member, index) => (
          <div
            key={member.user_id}
            className="flex items-center gap-3 min-h-[44px]"
          >
            <span className="text-sm font-medium w-5 text-center flex-none text-muted-foreground">
              {index === 0 ? "🏆" : index + 1}
            </span>

            <Avatar className="h-10 w-10 flex-none">
              <AvatarImage
                src={member.avatar_url ?? undefined}
                alt={member.display_name ?? member.username ?? "Membro"}
              />
              <AvatarFallback className="text-xs">{getInitials(member)}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {member.display_name || member.username || "Membro"}
              </p>
              <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{member.books_finished} livros</span>
                <span>
                  {member.avg_rating !== null
                    ? `${member.avg_rating.toFixed(1)} ★`
                    : "sem nota"}
                </span>
                <span>{member.current_streak}🔥</span>
                <span>{formatReadingTime(member.reading_time_minutes)}</span>
              </p>
            </div>

            <div className="flex-none text-right">
              <p className="text-sm font-semibold tabular-nums">
                {sortKey === "books_finished" && member.books_finished}
                {sortKey === "avg_rating" &&
                  (member.avg_rating !== null ? member.avg_rating.toFixed(1) : "—")}
                {sortKey === "current_streak" && member.current_streak}
                {sortKey === "reading_time_minutes" &&
                  formatReadingTime(member.reading_time_minutes)}
              </p>
              <p className="text-xs text-muted-foreground">
                {sortKey === "books_finished" && "livros"}
                {sortKey === "avg_rating" && "★"}
                {sortKey === "current_streak" && "dias"}
                {sortKey === "reading_time_minutes" && "lidos"}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
