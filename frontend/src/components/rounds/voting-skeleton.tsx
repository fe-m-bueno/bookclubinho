import { Skeleton } from "@/components/ui/skeleton";

export function VotingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border p-3 shadow-warm-sm space-y-3">
            <div className="flex gap-3">
              <Skeleton className="h-[120px] w-20 rounded-md shrink-0" />
              {/* As alturas seguem os degraus do card real: título em
                  `type-body` mede 22px de linha, autor e pitch em `type-meta`
                  medem 18. A terceira barra é a linha de quem indicou, que no
                  card tem um avatar de 24px ao lado do nome e por isso é a
                  mais alta das três — era o que fazia o bloco chegar curto. */}
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
