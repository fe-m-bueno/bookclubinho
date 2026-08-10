"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StarsDisplay } from "@/components/ui/stars-display";
import type { ReviewResponse, ReviewStatsResponse } from "@/lib/types/round";

const BOOL_BADGES: { key: keyof ReviewResponse; label: string; emoji: string }[] = [
  { key: "cried", label: "Chorou", emoji: "\uD83D\uDE22" },
  { key: "loved_it", label: "Amou", emoji: "\uD83D\uDE0D" },
  { key: "felt_aroused", label: "Tesão", emoji: "\uD83E\uDD75" },
  { key: "found_heavy", label: "Pesado", emoji: "\uD83C\uDFCB\uFE0F" },
  { key: "wants_more_from_author", label: "Mais", emoji: "\uD83D\uDCDA" },
];

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
      {/* Sem `pt-4`: o primitivo já traz o `py-5` da escala, e o override
          daqui era o que fazia dois cards vizinhos respirarem diferente. */}
      <CardContent className="space-y-3">
        {/* Header: avatar + name + stars */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={review.user.avatar_url ?? undefined}
              alt={review.user.display_name ?? review.user.username}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="type-body truncate">
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
                className="type-micro inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
              >
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Sincere review */}
        <p className="type-body">{review.sincere_review}</p>

        {/* One-liner */}
        {review.funny_oneliner && (
          <p className="type-meta italic">
            &ldquo;{review.funny_oneliner}&rdquo;
          </p>
        )}

        {/* Extra thoughts */}
        {review.extra_thoughts && (
          <p className="type-meta">{review.extra_thoughts}</p>
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
      <CardContent>
        <div className="flex items-center justify-between mb-3">
          <h3 className="type-title">Estatísticas</h3>
          <div className="flex items-center gap-1.5">
            <StarsDisplay rating={Math.round(stats.avg_star_rating)} />
            <span className="type-body">
              {stats.avg_star_rating.toFixed(1)}
            </span>
          </div>
        </div>
        {/* Meta, e não corpo: são seis contagens em duas colunas de 375px, e
            no degrau de corpo "Mais do autor" já dobrava de linha. */}
        <div className="type-meta grid grid-cols-2 gap-2">
          <span>{"\uD83D\uDE22"} Choraram: {pct(stats.cried_count)}%</span>
          <span>{"\uD83D\uDE0D"} Amaram: {pct(stats.loved_it_count)}%</span>
          {/* Era `Tesão` escrito no texto do JSX, onde a sequência não é
              escape nenhum: a tela mostrava a barra invertida. */}
          <span>{"\uD83E\uDD75"} Tesão: {pct(stats.felt_aroused_count)}%</span>
          <span>{"\uD83C\uDFCB\uFE0F"} Pesado: {pct(stats.found_heavy_count)}%</span>
          <span>{"\uD83D\uDCDA"} Mais do autor: {pct(stats.wants_more_count)}%</span>
          <span className="type-micro">
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
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                {/* Nome em `type-body`: 22px de linha, não 16. */}
                <Skeleton className="h-5 w-24" />
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
