import { Skeleton } from "@/components/ui/skeleton";

export function PrivacySettingsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="rounded-2xl border-destructive/30 bg-destructive/5 p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}
