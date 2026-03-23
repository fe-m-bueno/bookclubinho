import { Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <div className="flex flex-col bg-background">
      {/* Greeting area */}
      <header className="px-6 pt-10 pb-8">
        <div className="mx-auto flex max-w-2xl items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-44" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6">
        {/* Ornament divider placeholder */}
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-px flex-1" />
        </div>

        {/* Group cards — apenas 2 para não criar scroll */}
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-2xl border bg-card p-5 shadow-warm-sm"
            >
              <div className="flex gap-4">
                {i === 0 ? (
                  <Skeleton className="h-[88px] w-[60px] shrink-0 rounded-lg" />
                ) : (
                  <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
                )}
                <div className="flex flex-1 flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-36" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    {i === 0 && (
                      <>
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-28" />
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Skeleton className="h-3 w-6" />
                    <div className="flex -space-x-1.5">
                      {[0, 1, 2].map((j) => (
                        <Skeleton
                          key={j}
                          className="h-6 w-6 rounded-full ring-2 ring-background"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="my-3 border-t border-border/40" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
