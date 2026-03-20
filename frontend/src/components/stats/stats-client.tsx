"use client";

import Link from "next/link";
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
