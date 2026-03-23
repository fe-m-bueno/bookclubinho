import { Skeleton } from "@/components/ui/skeleton";

export function BadgesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-7 w-44" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg sm:w-96" />
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="rounded-2xl h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
