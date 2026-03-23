import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSettingsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Avatar card */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 flex flex-col items-center gap-4">
        <Skeleton className="w-24 h-24 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>

      {/* Info card */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Account card */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>

      {/* Stats card */}
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
