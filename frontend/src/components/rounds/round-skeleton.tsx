import { Skeleton } from "@/components/ui/skeleton";

export function RoundSkeleton() {
  return (
    <div className="space-y-6">
      {/* Status badge */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-11 w-full rounded-lg" />

      {/* Book result cards horizontal scroll */}
      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="shrink-0 w-28 space-y-2">
            <Skeleton className="h-40 w-28 rounded-lg" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Nomination cards */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl border">
            <Skeleton className="h-16 w-12 rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
