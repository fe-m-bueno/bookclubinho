"use client";

import { Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewResponse, ReviewStatsResponse } from "@/lib/types/round";

const BOOL_BADGES: { key: keyof ReviewResponse; label: string; emoji: string }[] = [
  { key: "cried", label: "Chorou", emoji: "\uD83D\uDE22" },
  { key: "loved_it", label: "Amou", emoji: "\uD83D\uDE0D" },
  { key: "felt_aroused", label: "Tes\u00E3o", emoji: "\uD83E\uDD75" },
  { key: "found_heavy", label: "Pesado", emoji: "\uD83C\uDFCB\uFE0F" },
  { key: "wants_more_from_author", label: "Mais", emoji: "\uD83D\uDCDA" },
];

function StarsDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${
            s <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-none text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewResponse }) {
  const activeBools = BOOL_BADGES.filter(
    (b) => review[b.key] === true,
  );
  const initials =
    (review.user.display_name || review.user.username || "?")
      .slice(0, 2)
      .toUpperCase();

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {/* Header: avatar + name + stars */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={review.user.avatar_url ?? undefined}
              alt={review.user.display_name ?? review.user.username}
            />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {review.user.display_name || review.user.username}
            </p>
            <StarsDisplay rating={review.star_rating} />
          </div>
        </div>

        {/* Boolean badges */}
        {activeBools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeBools.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Sincere review */}
        <p className="text-sm leading-relaxed">{review.sincere_review}</p>

        {/* One-liner */}
        {review.funny_oneliner && (
          <p className="text-sm italic text-muted-foreground">
            &ldquo;{review.funny_oneliner}&rdquo;
          </p>
        )}

        {/* Extra thoughts */}
        {review.extra_thoughts && (
          <p className="text-sm text-muted-foreground">
            {review.extra_thoughts}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatsCard({ stats }: { stats: ReviewStatsResponse }) {
  const pct = (count: number) =>
    stats.total_reviews > 0
      ? Math.round((count / stats.total_reviews) * 100)
      : 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Estatísticas</h3>
          <div className="flex items-center gap-1.5">
            <StarsDisplay rating={Math.round(stats.avg_star_rating)} />
            <span className="text-sm font-medium">
              {stats.avg_star_rating.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{"\uD83D\uDE22"} Choraram: {pct(stats.cried_count)}%</span>
          <span>{"\uD83D\uDE0D"} Amaram: {pct(stats.loved_it_count)}%</span>
          <span>{"\uD83E\uDD75"} Tes\u00E3o: {pct(stats.felt_aroused_count)}%</span>
          <span>{"\uD83C\uDFCB\uFE0F"} Pesado: {pct(stats.found_heavy_count)}%</span>
          <span>{"\uD83D\uDCDA"} Mais do autor: {pct(stats.wants_more_count)}%</span>
          <span className="text-muted-foreground">
            {stats.total_reviews} review{stats.total_reviews !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewsListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface ReviewsListProps {
  reviews: ReviewResponse[];
  stats: ReviewStatsResponse | null;
}

export function ReviewsList({ reviews, stats }: ReviewsListProps) {
  return (
    <div className="space-y-4">
      {stats && <StatsCard stats={stats} />}
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}
