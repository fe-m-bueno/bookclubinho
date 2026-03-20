import { Skeleton } from "@/components/ui/skeleton";

export function ShelfSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
            <Skeleton className="h-3 w-3/4 mx-auto" />
            <Skeleton className="h-3 w-1/2 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
