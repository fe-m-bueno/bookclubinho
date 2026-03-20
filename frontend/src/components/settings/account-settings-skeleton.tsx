import { Skeleton } from "@/components/ui/skeleton";

export function AccountSettingsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card rounded-2xl shadow-sm p-5 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
