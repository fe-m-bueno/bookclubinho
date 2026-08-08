import { Skeleton } from "@/components/ui/skeleton";
import { HomeColumns, HomeHeader, HomeMain, HomeShell } from "./home-shell";

/**
 * Fidelidade aproximada de propósito: blocos de volume parecido, sem replicar o
 * layout item a item. O que precisa bater é o *container* — é dele que vem o
 * salto ao carregar — e ele vem do `HomeShell`, o mesmo da `HomeClient`.
 */
export function HomeSkeleton() {
  return (
    <HomeShell>
      <HomeHeader>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </HomeHeader>

      <HomeMain>
        {/* As mesmas duas colunas do conteúdo. Sem elas o skeleton usaria a
            largura toda do `max-w-6xl` no desktop e os cards encolheriam de
            ~1150px para 672px quando o dado chegasse — o salto que o container
            compartilhado existe para impedir. */}
        <HomeColumns
          rail={
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-[76px] rounded-xl" />
                <Skeleton className="h-[76px] rounded-xl" />
              </div>
            </div>
          }
        >
        {/* Divisor ornamentado */}
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-px flex-1" />
        </div>

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
        </HomeColumns>
      </HomeMain>
    </HomeShell>
  );
}
