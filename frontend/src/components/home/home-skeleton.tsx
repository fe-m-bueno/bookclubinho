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
              {/* O card de três linhas do "Você" e o bloco de encontro, que
                  existe cheio ou vazio — os dois aparecem em toda sessão, e o
                  skeleton reserva a altura dos dois. */}
              {/* Os cabeçalhos ocupam os mesmos `h-6` + `mb-6` do conteúdo,
                  nas duas colunas: é isso que faz o primeiro card de cada uma
                  nascer na mesma linha, aqui e depois que o dado chega. */}
              <div>
                <div className="mb-6 flex h-6 items-center">
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-[145px] rounded-xl" />
              </div>
              <div>
                <div className="mb-6 flex h-6 items-center">
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-[46px] rounded-xl" />
              </div>
            </div>
          }
        >
        {/* Divisor ornamentado */}
        <div className="mb-6 flex h-6 items-center gap-3">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-px flex-1" />
        </div>

        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border bg-card shadow-warm-sm"
            >
              <div className="flex gap-4 p-5">
                {i === 0 ? (
                  <Skeleton className="h-[88px] w-[60px] shrink-0 rounded-lg" />
                ) : (
                  <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-2">
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
                    <div className="flex shrink-0 -space-x-2">
                      {[0, 1, 2].map((j) => (
                        <Skeleton
                          key={j}
                          className="h-6 w-6 rounded-full ring-2 ring-background"
                        />
                      ))}
                    </div>
                  </div>
                  {i === 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <Skeleton className="h-1.5 flex-1 rounded-full" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                  )}
                </div>
              </div>
              {/* A faixa do rodapé, com a mesma borda e o mesmo fundo do card
                  real — é o bloco de maior contraste e o que mais salta se
                  aparecer só depois. */}
              <div className="flex items-center gap-3 border-t bg-muted/40 px-5 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-9 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        </HomeColumns>
      </HomeMain>
    </HomeShell>
  );
}
