"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupStats } from "@/hooks/use-group-stats";
import { useShelf } from "@/hooks/use-shelf";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { StatsSkeleton } from "./stats-skeleton";
import { StatsOverviewCards } from "./stats-overview-cards";
import { RatingDistributionChart } from "./rating-distribution-chart";
import { GenreBreakdownChart } from "./genre-breakdown-chart";
import { MemberLeaderboard } from "./member-leaderboard";
import { EmotionalStatsSection } from "./emotional-stats-section";
import { ReadingTimeline } from "./reading-timeline";
import { errorMessage } from "@/lib/api";


/**
 * Superfície de celebração: mais quente que o app comum de propósito, por isso
 * usa a escala `brand-*` em vez dos tokens de superfície. Tinha 16 hex cravados
 * — era o único componente que seguia o CLAUDE.md ao pé da letra, e por isso o
 * único que destoava do resto (#288).
 */
function WrappedBanner({ groupId, year }: { groupId: string; year: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-200 via-brand-300 to-brand-400 dark:from-brand-800 dark:via-brand-700 dark:to-brand-800 p-5">
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-700 dark:text-brand-300" />
            <h3 className="type-title text-brand-900 dark:text-brand-100">
              Wrapped {year}
            </h3>
          </div>
          <p className="type-meta text-brand-700 dark:text-brand-300">
            Reviva os melhores momentos do clube em {year}.
          </p>
        </div>
        <Button
          asChild
          className="shrink-0 bg-brand-900 text-brand-50 hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-900 dark:hover:bg-brand-200"
        >
          <Link href={`/groups/${groupId}/wrapped/${year}`}>
            Ver agora →
          </Link>
        </Button>
      </div>
      {/* decorative blobs */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-100/40 dark:bg-brand-600/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-4 left-8 h-16 w-16 rounded-full bg-brand-400/25 dark:bg-brand-500/20 blur-xl" />
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
  const { data, isLoading, error, refetch } = useGroupStats(groupId);
  const now = new Date();
  const currentYear = now.getFullYear();
  const isDecember = now.getMonth() === 11;

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) {
    return <StatsSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="type-meta">{errorMessage(error)}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!data || data.total_books_read === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="type-title">Nenhum livro lido ainda</p>
        <p className="type-meta">
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
          className="type-meta text-primary underline-offset-4 hover:underline"
        >
          Ver conquistas →
        </Link>
      </div>
    </div>
  );
}
