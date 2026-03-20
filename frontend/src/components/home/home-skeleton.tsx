import { Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-36" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-6">
        {/* Groups section */}
        <section>
          <Skeleton className="mb-3 h-5 w-20" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Meetings section */}
        <section>
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
