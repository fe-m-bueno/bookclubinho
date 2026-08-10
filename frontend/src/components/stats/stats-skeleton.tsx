"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function CardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      </CardContent>
    </Card>
  );
}

function LeaderboardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-36" />
        {/* `flex-wrap` como no componente: em 375px os quatro filtros não cabem
            numa linha, e sem isso o skeleton reservava uma linha para o que a
            tela desenha em duas. */}
        <div className="flex flex-wrap gap-2 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          // `min-h-11` é o mesmo mínimo da linha real, que é o alvo de toque.
          <div key={i} className="flex min-h-11 items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full flex-none" />
            <div className="flex-1 space-y-1.5">
              {/* Nome em `type-body` mede 22px de linha, e a fileira de números
                  em `type-micro` mede 14. Eram h-4 e h-3, de antes da rampa. */}
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3.5 w-48" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-hidden pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            // O título do livro tem `line-clamp-2` e quase sempre ocupa as
            // duas linhas na coluna de 80px — por isso duas barras, e não uma.
            <div key={i} className="flex-none w-20 space-y-1.5">
              <Skeleton className="w-20 rounded-lg" style={{ aspectRatio: "2/3" }} />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsSkeleton() {
  return (
    <div className="space-y-8 p-4">
      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height={200} />
        <ChartSkeleton height={280} />
      </div>

      {/* Leaderboard */}
      <LeaderboardSkeleton />

      {/* Emotional stats */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Timeline */}
      <TimelineSkeleton />
    </div>
  );
}
