const AVATAR_SLOTS = [0, 1, 2, 3];
const TAB_SLOTS = [0, 1, 2, 3, 4];

export function GroupLayoutSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header skeleton */}
      <div className="bg-card rounded-2xl shadow-sm p-4 mx-4 mt-4 flex items-center gap-3 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="flex -space-x-2">
            {AVATAR_SLOTS.map((i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full bg-muted ring-2 ring-background"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Tabs skeleton - desktop */}
      <div className="hidden md:flex px-4 mt-2 gap-4 border-b border-border animate-pulse">
        {TAB_SLOTS.map((i) => (
          <div key={i} className="h-10 w-20 bg-muted rounded" />
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 p-4 animate-pulse">
        <div className="h-40 bg-muted rounded-xl" />
      </div>
    </div>
  );
}
