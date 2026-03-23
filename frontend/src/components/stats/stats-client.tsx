"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupStats } from "@/hooks/use-group-stats";
import { useShelf } from "@/hooks/use-shelf";
import { StatsSkeleton } from "./stats-skeleton";
import { StatsOverviewCards } from "./stats-overview-cards";
import { RatingDistributionChart } from "./rating-distribution-chart";
import { GenreBreakdownChart } from "./genre-breakdown-chart";
import { MemberLeaderboard } from "./member-leaderboard";
import { EmotionalStatsSection } from "./emotional-stats-section";
import { ReadingTimeline } from "./reading-timeline";


function WrappedBanner({ groupId, year }: { groupId: string; year: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F8DFBF] via-[#EDCB96] to-[#DFB98A] dark:from-[#3D2E1A] dark:via-[#4A3520] dark:to-[#3D2E1A] p-6">
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            <h3 className="font-display text-lg font-bold text-[#30261D] dark:text-[#F8DFBF]">
              Wrapped {year}
            </h3>
          </div>
          <p className="text-sm text-[#5A4032] dark:text-[#C4A882]">
            Reviva os melhores momentos do clube em {year}.
          </p>
        </div>
        <Button
          asChild
          className="shrink-0 bg-[#30261D] text-[#F8DFBF] hover:bg-[#3D2E1A] dark:bg-[#F8DFBF] dark:text-[#30261D] dark:hover:bg-[#EDCB96]"
        >
          <Link href={`/groups/${groupId}/wrapped/${year}`}>
            Ver agora →
          </Link>
        </Button>
      </div>
      {/* decorative blobs */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-300/30 dark:bg-amber-600/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-4 left-8 h-16 w-16 rounded-full bg-orange-300/20 dark:bg-orange-700/20 blur-xl" />
    </div>
  );
}

interface StatsClientProps {
  groupId: string;
}

// Isolated so useShelf only fires when there are books to display
function ShelfTimeline({ groupId }: { groupId: string }) {
  const { data } = useShelf(groupId);
  return <ReadingTimeline books={data?.books ?? []} />;
}

export function StatsClient({ groupId }: StatsClientProps) {
  const { data, loading, error, refetch } = useGroupStats(groupId);
  const now = new Date();
  const currentYear = now.getFullYear();
  const isDecember = now.getMonth() === 11;

  if (loading) {
    return <StatsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!data || data.total_books_read === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-base font-medium">Nenhum livro lido ainda</p>
        <p className="text-sm text-muted-foreground">
          Completem a primeira rodada para ver as estatísticas do grupo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4">
      <StatsOverviewCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RatingDistributionChart data={data.rating_distribution} />
        <GenreBreakdownChart data={data.books_per_genre} />
      </div>

      <MemberLeaderboard members={data.member_leaderboard} />

      {data.emotional_stats.total_reviews > 0 && (
        <EmotionalStatsSection stats={data.emotional_stats} />
      )}

      <ShelfTimeline groupId={groupId} />

      {isDecember && <WrappedBanner groupId={groupId} year={currentYear} />}

      <div className="text-center pt-2">
        <Link
          href="/badges"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Ver conquistas →
        </Link>
      </div>
    </div>
  );
}
