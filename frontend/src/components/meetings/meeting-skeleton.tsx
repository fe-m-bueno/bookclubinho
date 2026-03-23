"use client";

import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-warm-sm space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40 rounded" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-56 rounded" />
      <Skeleton className="h-4 w-32 rounded" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
      <div className="flex -space-x-2 pt-1">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="size-7 rounded-full border-2 border-card" />
        ))}
      </div>
    </div>
  );
}

export function MeetingSkeleton() {
  return (
    <div
      aria-label="Carregando encontros"
      aria-busy="true"
      className="space-y-4"
    >
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
