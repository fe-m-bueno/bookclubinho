import { Skeleton } from "@/components/ui/skeleton";

export function NotificationsSettingsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="bg-card rounded-2xl shadow-warm-sm p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1 mr-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-6 w-11 rounded-full shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}
