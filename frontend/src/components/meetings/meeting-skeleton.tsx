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

export function MeetingDetailSkeleton() {
  return (
    <div
      aria-label="Carregando detalhes do encontro"
      aria-busy="true"
      className="space-y-6"
    >
      {/* Back button skeleton */}
      <Skeleton className="h-8 w-20 rounded" />

      {/* Header section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <Skeleton className="h-8 w-64 rounded mb-3" />
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-4 w-44 rounded" />
        </div>

        <Skeleton className="h-12 w-full rounded" />

        <div className="flex gap-2 flex-wrap pt-2 border-t">
          <Skeleton className="h-9 w-16 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>

        <div className="flex gap-2 border-t pt-4">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>

      {/* Participants section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Skeleton className="h-6 w-40 rounded" />

        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
