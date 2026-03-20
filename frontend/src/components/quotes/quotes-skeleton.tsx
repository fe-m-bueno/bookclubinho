import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_HEIGHTS = ["h-28", "h-40", "h-32", "h-24", "h-36", "h-28"];

export function QuotesSkeleton() {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
      {SKELETON_HEIGHTS.map((height, i) => (
        <div key={i} className="break-inside-avoid mb-4">
          <Skeleton className={`w-full rounded-xl ${height}`} />
        </div>
      ))}
    </div>
  );
}
